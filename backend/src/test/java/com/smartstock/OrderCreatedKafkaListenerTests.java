package com.smartstock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartstock.modules.inventory.consumer.OrderCreatedKafkaListener;
import com.smartstock.modules.inventory.service.InventoryReservationService;
import com.smartstock.modules.inventory.service.InventoryReservationService.ReservationOutcome;
import com.smartstock.modules.order.event.OrderCreatedEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderCreatedKafkaListener Unit Tests")
class OrderCreatedKafkaListenerTests {

    @Mock
    private InventoryReservationService reservationService;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    @Mock
    private Acknowledgment acknowledgment;

    @InjectMocks
    private OrderCreatedKafkaListener listener;

    private static final String TOPIC = "order.created.v1";
    private static final String DLT_TOPIC = "order.created.v1.DLT";

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(listener, "orderCreatedTopic", TOPIC);
        ReflectionTestUtils.setField(listener, "orderCreatedDltTopic", DLT_TOPIC);
    }

    @Test
    @DisplayName("Valid event: executes reservation service and acknowledges Kafka message")
    void testSuccessfulProcessingAcknowledgesMessage() throws Exception {
        String eventId = UUID.randomUUID().toString();
        OrderCreatedEvent event = OrderCreatedEvent.builder()
                .eventId(eventId)
                .orderId(101L)
                .customerId(1L)
                .totalAmount(new BigDecimal("1500.00"))
                .items(List.of(new OrderCreatedEvent.OrderItemPayload(1L, 2, new BigDecimal("750.00"))))
                .build();

        String payload = objectMapper.writeValueAsString(event);

        when(reservationService.processOrderCreated(any(OrderCreatedEvent.class)))
                .thenReturn(ReservationOutcome.CONFIRMED);

        listener.onOrderCreated(payload, TOPIC, "101", acknowledgment);

        verify(reservationService).processOrderCreated(any(OrderCreatedEvent.class));
        verify(acknowledgment).acknowledge();
        verifyNoInteractions(kafkaTemplate);
    }

    @Test
    @DisplayName("Malformed JSON payload: synchronously routes to DLT and acknowledges poison message")
    void testMalformedJsonRoutesToDlt() {
        String malformedJson = "{ invalid json payload syntax !!!";
        when(kafkaTemplate.send(eq(DLT_TOPIC), eq("bad-key"), eq(malformedJson)))
                .thenReturn(CompletableFuture.completedFuture(null));

        listener.onOrderCreated(malformedJson, TOPIC, "bad-key", acknowledgment);

        verify(kafkaTemplate).send(eq(DLT_TOPIC), eq("bad-key"), eq(malformedJson));
        verify(acknowledgment).acknowledge();
        verifyNoInteractions(reservationService);
    }

    @Test
    @DisplayName("Invalid event missing required fields: routes to DLT and acknowledges")
    void testMissingRequiredFieldsRoutesToDlt() {
        String invalidPayload = "{\"totalAmount\": 100.00}"; // missing eventId & orderId
        when(kafkaTemplate.send(eq(DLT_TOPIC), eq("key"), eq(invalidPayload)))
                .thenReturn(CompletableFuture.completedFuture(null));

        listener.onOrderCreated(invalidPayload, TOPIC, "key", acknowledgment);

        verify(kafkaTemplate).send(eq(DLT_TOPIC), eq("key"), eq(invalidPayload));
        verify(acknowledgment).acknowledge();
        verifyNoInteractions(reservationService);
    }

    @Test
    @DisplayName("DLT publication failure: propagates exception and NEVER acknowledges the message")
    void testDltPublicationFailureDoesNotAcknowledgeMessage() {
        String malformedJson = "{ invalid json payload syntax !!!";
        CompletableFuture failedFuture = new CompletableFuture<>();
        failedFuture.completeExceptionally(new TimeoutException("Kafka broker ACK timeout"));

        when(kafkaTemplate.send(eq(DLT_TOPIC), eq("bad-key"), eq(malformedJson)))
                .thenReturn(failedFuture);

        assertThatThrownBy(() -> listener.onOrderCreated(malformedJson, TOPIC, "bad-key", acknowledgment))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Timed out publishing message to DLT");

        verify(acknowledgment, never()).acknowledge();
        verifyNoInteractions(reservationService);
    }

    @Test
    @DisplayName("DLT publication execution failure: propagates exception and NEVER acknowledges")
    void testDltPublicationExecutionExceptionDoesNotAcknowledgeMessage() {
        String malformedJson = "{ invalid json payload syntax !!!";
        CompletableFuture failedFuture = new CompletableFuture<>();
        failedFuture.completeExceptionally(new RuntimeException("Broker unreachable"));

        when(kafkaTemplate.send(eq(DLT_TOPIC), eq("bad-key"), eq(malformedJson)))
                .thenReturn(failedFuture);

        assertThatThrownBy(() -> listener.onOrderCreated(malformedJson, TOPIC, "bad-key", acknowledgment))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Failed to publish message to DLT");

        verify(acknowledgment, never()).acknowledge();
    }

    @Test
    @DisplayName("Confirmed duplicate event: verified in DB and acknowledged safely")
    void testConfirmedDuplicateAcknowledgesSafely() throws Exception {
        String eventId = UUID.randomUUID().toString();
        OrderCreatedEvent event = OrderCreatedEvent.builder()
                .eventId(eventId)
                .orderId(102L)
                .items(List.of(new OrderCreatedEvent.OrderItemPayload(1L, 1, new BigDecimal("100.00"))))
                .build();
        String payload = objectMapper.writeValueAsString(event);

        when(reservationService.processOrderCreated(any(OrderCreatedEvent.class)))
                .thenThrow(new DataIntegrityViolationException("Duplicate key on event_id"));
        when(reservationService.isEventProcessed(eventId)).thenReturn(true);

        listener.onOrderCreated(payload, TOPIC, "102", acknowledgment);

        verify(reservationService).isEventProcessed(eventId);
        verify(acknowledgment).acknowledge();
    }

    @Test
    @DisplayName("Unrelated DataIntegrityViolationException: NOT confirmed as duplicate, propagates without ACK")
    void testUnrelatedDataIntegrityViolationNotAcknowledgedAndPropagated() throws Exception {
        String eventId = UUID.randomUUID().toString();
        OrderCreatedEvent event = OrderCreatedEvent.builder()
                .eventId(eventId)
                .orderId(102L)
                .items(List.of(new OrderCreatedEvent.OrderItemPayload(1L, 1, new BigDecimal("100.00"))))
                .build();
        String payload = objectMapper.writeValueAsString(event);

        when(reservationService.processOrderCreated(any(OrderCreatedEvent.class)))
                .thenThrow(new DataIntegrityViolationException("FK constraint failure on product_id"));
        when(reservationService.isEventProcessed(eventId)).thenReturn(false);

        assertThatThrownBy(() -> listener.onOrderCreated(payload, TOPIC, "102", acknowledgment))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("FK constraint failure on product_id");

        verify(reservationService).isEventProcessed(eventId);
        verify(acknowledgment, never()).acknowledge();
    }

    @Test
    @DisplayName("Transient database exception: does not acknowledge and rethrows for Kafka retry")
    void testTransientExceptionRethrowsWithoutAck() throws Exception {
        String eventId = UUID.randomUUID().toString();
        OrderCreatedEvent event = OrderCreatedEvent.builder()
                .eventId(eventId)
                .orderId(103L)
                .items(List.of(new OrderCreatedEvent.OrderItemPayload(1L, 1, new BigDecimal("100.00"))))
                .build();
        String payload = objectMapper.writeValueAsString(event);

        when(reservationService.processOrderCreated(any(OrderCreatedEvent.class)))
                .thenThrow(new RuntimeException("Transient DB connection timeout"));

        assertThatThrownBy(() -> listener.onOrderCreated(payload, TOPIC, "103", acknowledgment))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Transient DB connection timeout");

        verify(acknowledgment, never()).acknowledge();
    }

    @Test
    @DisplayName("Poison pill recovery: normal messages continue processing cleanly after poison message")
    void testNormalMessagesContinueProcessingAfterMalformedPoisonPill() throws Exception {
        // Message 1: Malformed JSON poison pill
        String poisonPill = "{ malformed poison pill syntax !!!";
        when(kafkaTemplate.send(eq(DLT_TOPIC), eq("poison-key"), eq(poisonPill)))
                .thenReturn(CompletableFuture.completedFuture(null));

        Acknowledgment ack1 = mock(Acknowledgment.class);
        listener.onOrderCreated(poisonPill, TOPIC, "poison-key", ack1);

        verify(kafkaTemplate).send(eq(DLT_TOPIC), eq("poison-key"), eq(poisonPill));
        verify(ack1).acknowledge();
        verifyNoInteractions(reservationService);

        // Message 2: Subsequent valid order event
        String eventId = UUID.randomUUID().toString();
        OrderCreatedEvent validEvent = OrderCreatedEvent.builder()
                .eventId(eventId)
                .orderId(104L)
                .customerId(1L)
                .totalAmount(new BigDecimal("999.00"))
                .items(List.of(new OrderCreatedEvent.OrderItemPayload(1L, 1, new BigDecimal("999.00"))))
                .build();
        String validPayload = objectMapper.writeValueAsString(validEvent);

        when(reservationService.processOrderCreated(any(OrderCreatedEvent.class)))
                .thenReturn(ReservationOutcome.CONFIRMED);

        Acknowledgment ack2 = mock(Acknowledgment.class);
        listener.onOrderCreated(validPayload, TOPIC, "104", ack2);

        verify(reservationService).processOrderCreated(any(OrderCreatedEvent.class));
        verify(ack2).acknowledge();
    }
}
