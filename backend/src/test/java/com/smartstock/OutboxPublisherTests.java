package com.smartstock;

import com.smartstock.common.event.model.OutboxEvent;
import com.smartstock.common.event.model.OutboxStatus;
import com.smartstock.common.event.publisher.OutboxEventUpdateService;
import com.smartstock.common.event.publisher.OutboxPublisher;
import com.smartstock.common.event.repository.OutboxEventRepository;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.TopicPartition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OutboxPublisher Unit Tests")
class OutboxPublisherTests {

    @Mock
    private OutboxEventRepository outboxEventRepository;

    @Mock
    private OutboxEventUpdateService outboxEventUpdateService;

    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    @InjectMocks
    private OutboxPublisher outboxPublisher;

    private static final String TOPIC = "order.created.v1";

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(outboxPublisher, "enabled", true);
        ReflectionTestUtils.setField(outboxPublisher, "batchSize", 50);
        ReflectionTestUtils.setField(outboxPublisher, "sendTimeoutSeconds", 5);
        ReflectionTestUtils.setField(outboxPublisher, "orderCreatedTopic", TOPIC);
    }

    private SendResult<String, String> createMockSendResult(String topic, String key, String value) {
        ProducerRecord<String, String> record = new ProducerRecord<>(topic, key, value);
        RecordMetadata metadata = new RecordMetadata(
                new TopicPartition(topic, 0), 0, 0, System.currentTimeMillis(), 0, 0
        );
        return new SendResult<>(record, metadata);
    }

    private OutboxEvent buildPendingEvent(Long id, String aggregateId, String payload) {
        return OutboxEvent.builder()
                .id(id)
                .eventId(UUID.randomUUID().toString())
                .aggregateId(aggregateId)
                .eventType("OrderCreated")
                .payload(payload)
                .status(OutboxStatus.PENDING)
                .attempts(0)
                .createdAt(LocalDateTime.now())
                .build();
    }

    @Nested
    @DisplayName("Configuration & Guard Tests")
    class GuardTests {

        @Test
        @DisplayName("Should skip publishing when publisher is disabled")
        void shouldSkipWhenDisabled() {
            ReflectionTestUtils.setField(outboxPublisher, "enabled", false);

            int published = outboxPublisher.publishPendingEvents();

            assertThat(published).isZero();
            verifyNoInteractions(outboxEventRepository);
            verifyNoInteractions(kafkaTemplate);
        }

        @Test
        @DisplayName("Should return 0 when no pending events are found in database")
        void shouldReturnZeroWhenNoEvents() {
            when(outboxEventRepository.findByStatusOrderByCreatedAtAsc(eq(OutboxStatus.PENDING), any(Pageable.class)))
                    .thenReturn(Collections.emptyList());

            int published = outboxPublisher.publishPendingEvents();

            assertThat(published).isZero();
            verifyNoInteractions(kafkaTemplate);
            verifyNoInteractions(outboxEventUpdateService);
        }

        @Test
        @DisplayName("Should skip event when eventType has no mapped topic")
        void shouldSkipWhenEventTypeUnknown() {
            OutboxEvent unknownEvent = buildPendingEvent(99L, "123", "{}");
            unknownEvent.setEventType("UnknownEventType");

            when(outboxEventRepository.findByStatusOrderByCreatedAtAsc(eq(OutboxStatus.PENDING), any(Pageable.class)))
                    .thenReturn(List.of(unknownEvent));

            int published = outboxPublisher.publishPendingEvents();

            assertThat(published).isZero();
            verifyNoInteractions(kafkaTemplate);
            verifyNoInteractions(outboxEventUpdateService);
        }
    }

    @Nested
    @DisplayName("Successful Publishing Tests")
    class SuccessTests {

        @Test
        @DisplayName("Should publish pending event to Kafka with aggregateId as key and mark as PUBLISHED")
        void shouldPublishPendingEventSuccessfully() {
            String orderId = "42";
            String payload = "{\"orderId\":42,\"totalAmount\":150.00}";
            OutboxEvent event = buildPendingEvent(1L, orderId, payload);

            when(outboxEventRepository.findByStatusOrderByCreatedAtAsc(eq(OutboxStatus.PENDING), any(Pageable.class)))
                    .thenReturn(List.of(event));

            SendResult<String, String> sendResult = createMockSendResult(TOPIC, orderId, payload);
            CompletableFuture<SendResult<String, String>> future = CompletableFuture.completedFuture(sendResult);
            when(kafkaTemplate.send(eq(TOPIC), eq(orderId), eq(payload))).thenReturn(future);

            int published = outboxPublisher.publishPendingEvents();

            assertThat(published).isEqualTo(1);

            // Verify KafkaTemplate received topic, orderId as message key, and raw JSON payload
            ArgumentCaptor<String> topicCaptor = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
            verify(kafkaTemplate).send(topicCaptor.capture(), keyCaptor.capture(), payloadCaptor.capture());

            assertThat(topicCaptor.getValue()).isEqualTo(TOPIC);
            assertThat(keyCaptor.getValue()).isEqualTo(orderId);
            assertThat(payloadCaptor.getValue()).isEqualTo(payload);

            // Verify status marked as PUBLISHED in short database transaction
            verify(outboxEventUpdateService).markAsPublished(1L);
            verify(outboxEventUpdateService, never()).markAsFailed(any());
        }

        @Test
        @DisplayName("Should preserve message order by using aggregateId (orderId) as partition key")
        void shouldUseOrderIdAsPartitionKey() {
            OutboxEvent event1 = buildPendingEvent(1L, "order-101", "{\"orderId\":101}");
            OutboxEvent event2 = buildPendingEvent(2L, "order-102", "{\"orderId\":102}");

            when(outboxEventRepository.findByStatusOrderByCreatedAtAsc(eq(OutboxStatus.PENDING), any(Pageable.class)))
                    .thenReturn(List.of(event1, event2));

            SendResult<String, String> res1 = createMockSendResult(TOPIC, "order-101", event1.getPayload());
            SendResult<String, String> res2 = createMockSendResult(TOPIC, "order-102", event2.getPayload());

            when(kafkaTemplate.send(eq(TOPIC), eq("order-101"), eq(event1.getPayload())))
                    .thenReturn(CompletableFuture.completedFuture(res1));
            when(kafkaTemplate.send(eq(TOPIC), eq("order-102"), eq(event2.getPayload())))
                    .thenReturn(CompletableFuture.completedFuture(res2));

            int published = outboxPublisher.publishPendingEvents();

            assertThat(published).isEqualTo(2);
            verify(outboxEventUpdateService).markAsPublished(1L);
            verify(outboxEventUpdateService).markAsPublished(2L);
        }
    }

    @Nested
    @DisplayName("Failure & Retry Tests")
    class FailureTests {

        @Test
        @DisplayName("Should increment attempts and keep event retryable when Kafka broker fails with exception")
        void shouldHandleKafkaDeliveryFailure() {
            String orderId = "50";
            String payload = "{\"orderId\":50}";
            OutboxEvent event = buildPendingEvent(2L, orderId, payload);

            when(outboxEventRepository.findByStatusOrderByCreatedAtAsc(eq(OutboxStatus.PENDING), any(Pageable.class)))
                    .thenReturn(List.of(event));

            CompletableFuture<SendResult<String, String>> failedFuture = new CompletableFuture<>();
            failedFuture.completeExceptionally(new TimeoutException("Kafka broker acknowledgment timed out after 5000ms"));
            when(kafkaTemplate.send(eq(TOPIC), eq(orderId), eq(payload))).thenReturn(failedFuture);

            int published = outboxPublisher.publishPendingEvents();

            assertThat(published).isZero();
            verify(outboxEventUpdateService).markAsFailed(2L);
            verify(outboxEventUpdateService, never()).markAsPublished(any());
        }

        @Test
        @DisplayName("Should handle immediate exception from KafkaTemplate.send")
        void shouldHandleImmediateException() {
            String orderId = "51";
            String payload = "{\"orderId\":51}";
            OutboxEvent event = buildPendingEvent(3L, orderId, payload);

            when(outboxEventRepository.findByStatusOrderByCreatedAtAsc(eq(OutboxStatus.PENDING), any(Pageable.class)))
                    .thenReturn(List.of(event));

            when(kafkaTemplate.send(eq(TOPIC), eq(orderId), eq(payload)))
                    .thenThrow(new RuntimeException("Kafka producer connection refused"));

            int published = outboxPublisher.publishPendingEvents();

            assertThat(published).isZero();
            verify(outboxEventUpdateService).markAsFailed(3L);
            verify(outboxEventUpdateService, never()).markAsPublished(any());
        }

        @Test
        @DisplayName("Should retry previously failed pending event and mark as PUBLISHED upon recovery")
        void shouldRetryPreviouslyFailedEvent() {
            String orderId = "60";
            String payload = "{\"orderId\":60}";
            OutboxEvent previouslyFailedEvent = buildPendingEvent(4L, orderId, payload);
            previouslyFailedEvent.setAttempts(2); // Failed twice previously

            when(outboxEventRepository.findByStatusOrderByCreatedAtAsc(eq(OutboxStatus.PENDING), any(Pageable.class)))
                    .thenReturn(List.of(previouslyFailedEvent));

            SendResult<String, String> sendResult = createMockSendResult(TOPIC, orderId, payload);
            when(kafkaTemplate.send(eq(TOPIC), eq(orderId), eq(payload)))
                    .thenReturn(CompletableFuture.completedFuture(sendResult));

            int published = outboxPublisher.publishPendingEvents();

            assertThat(published).isEqualTo(1);
            verify(outboxEventUpdateService).markAsPublished(4L);
            verify(outboxEventUpdateService, never()).markAsFailed(any());
        }
    }
}
