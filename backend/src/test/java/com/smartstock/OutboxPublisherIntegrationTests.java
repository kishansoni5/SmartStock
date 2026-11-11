package com.smartstock;

import com.smartstock.common.event.model.OutboxEvent;
import com.smartstock.common.event.model.OutboxStatus;
import com.smartstock.common.event.publisher.OutboxPublisher;
import com.smartstock.common.event.repository.OutboxEventRepository;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.TopicPartition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@SpringBootTest
@ActiveProfiles("test")
@DisplayName("OutboxPublisher Integration Tests")
class OutboxPublisherIntegrationTests {

    @Autowired
    private OutboxPublisher outboxPublisher;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    @BeforeEach
    void setUp() {
        outboxEventRepository.deleteAll();
        reset(kafkaTemplate);
        // Explicitly enable publisher for this test suite
        ReflectionTestUtils.setField(outboxPublisher, "enabled", true);
    }

    private SendResult<String, String> createMockSendResult(String topic, String key, String payload) {
        ProducerRecord<String, String> record = new ProducerRecord<>(topic, key, payload);
        RecordMetadata metadata = new RecordMetadata(
                new TopicPartition(topic, 0), 0, 0, System.currentTimeMillis(), 0, 0
        );
        return new SendResult<>(record, metadata);
    }

    @Test
    @DisplayName("End-to-End: Pending event in database is published to Kafka and updated to PUBLISHED")
    void shouldPublishPendingEventFromDatabase() {
        String eventId = UUID.randomUUID().toString();
        OutboxEvent event = OutboxEvent.builder()
                .eventId(eventId)
                .aggregateId("999")
                .eventType("OrderCreated")
                .payload("{\"orderId\":999,\"totalAmount\":450.00}")
                .status(OutboxStatus.PENDING)
                .attempts(0)
                .build();
        OutboxEvent saved = outboxEventRepository.save(event);

        SendResult<String, String> sendResult = createMockSendResult("order.created.v1", "999", saved.getPayload());
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(sendResult));

        int publishedCount = outboxPublisher.publishPendingEvents();

        assertThat(publishedCount).isEqualTo(1);

        OutboxEvent updated = outboxEventRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(OutboxStatus.PUBLISHED);
        assertThat(updated.getPublishedAt()).isNotNull();
        assertThat(updated.getAttempts()).isZero();
    }

    @Test
    @DisplayName("End-to-End: Broker failure increments attempts in database and leaves status PENDING for retry")
    void shouldIncrementAttemptsInDatabaseOnBrokerFailure() {
        String eventId = UUID.randomUUID().toString();
        OutboxEvent event = OutboxEvent.builder()
                .eventId(eventId)
                .aggregateId("888")
                .eventType("OrderCreated")
                .payload("{\"orderId\":888}")
                .status(OutboxStatus.PENDING)
                .attempts(0)
                .build();
        OutboxEvent saved = outboxEventRepository.save(event);

        CompletableFuture<SendResult<String, String>> failedFuture = new CompletableFuture<>();
        failedFuture.completeExceptionally(new TimeoutException("Kafka broker leader not available"));
        when(kafkaTemplate.send(anyString(), anyString(), anyString())).thenReturn(failedFuture);

        int publishedCount = outboxPublisher.publishPendingEvents();

        assertThat(publishedCount).isZero();

        OutboxEvent updated = outboxEventRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(updated.getAttempts()).isEqualTo(1);
        assertThat(updated.getPublishedAt()).isNull();
    }

    @Test
    @DisplayName("End-to-End: Previously failed event is successfully retried and marked PUBLISHED")
    void shouldRetryFailedEventAndMarkPublished() {
        String eventId = UUID.randomUUID().toString();
        OutboxEvent failedEvent = OutboxEvent.builder()
                .eventId(eventId)
                .aggregateId("777")
                .eventType("OrderCreated")
                .payload("{\"orderId\":777}")
                .status(OutboxStatus.PENDING)
                .attempts(2) // Simulating 2 prior failures
                .build();
        OutboxEvent saved = outboxEventRepository.save(failedEvent);

        SendResult<String, String> sendResult = createMockSendResult("order.created.v1", "777", saved.getPayload());
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(sendResult));

        int publishedCount = outboxPublisher.publishPendingEvents();

        assertThat(publishedCount).isEqualTo(1);

        OutboxEvent updated = outboxEventRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(OutboxStatus.PUBLISHED);
        assertThat(updated.getPublishedAt()).isNotNull();
        assertThat(updated.getAttempts()).isEqualTo(2); // Kept historical attempt count
    }
}
