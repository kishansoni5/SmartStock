package com.smartstock.modules.inventory.consumer;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartstock.modules.inventory.service.InventoryReservationService;
import com.smartstock.modules.inventory.service.InventoryReservationService.ReservationOutcome;
import com.smartstock.modules.order.event.OrderCreatedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Kafka consumer listener for OrderCreated events.
 *
 * <p>Receives serialized JSON messages from the configured OrderCreated topic, validates payloads,
 * delegates transactional inventory reservation to InventoryReservationService, routes poison/malformed
 * payloads to the Dead Letter Topic (DLT), and acknowledges messages only after database commit.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderCreatedKafkaListener {

    private final InventoryReservationService reservationService;
    private final ObjectMapper objectMapper;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Value("${smartstock.kafka.topics.order-created:order.created.v1}")
    private String orderCreatedTopic;

    @Value("${smartstock.kafka.topics.order-created-dlt:order.created.v1.DLT}")
    private String orderCreatedDltTopic;

    @KafkaListener(
            topics = "${smartstock.kafka.topics.order-created:order.created.v1}",
            groupId = "${spring.kafka.consumer.group-id:smartstock-group}",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void onOrderCreated(@Payload String payload,
                               @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
                               @Header(name = KafkaHeaders.RECEIVED_KEY, required = false) String key,
                               Acknowledgment acknowledgment) {

        log.info("Received Kafka event from topic '{}' with key '{}'", topic, key);

        OrderCreatedEvent event;
        try {
            event = objectMapper.readValue(payload, OrderCreatedEvent.class);
        } catch (JsonProcessingException e) {
            log.error("Malformed JSON payload in OrderCreated topic '{}'. Routing to DLT. Error: {}", topic, e.getMessage());
            sendToDlt(key, payload, "MALFORMED_JSON: " + e.getMessage());
            if (acknowledgment != null) {
                acknowledgment.acknowledge();
            }
            return;
        }

        if (event == null || event.getEventId() == null || event.getOrderId() == null) {
            log.error("Permanently invalid OrderCreatedEvent (missing eventId or orderId). Routing to DLT.");
            sendToDlt(key, payload, "MISSING_REQUIRED_FIELDS");
            if (acknowledgment != null) {
                acknowledgment.acknowledge();
            }
            return;
        }

        try {
            // Execute business logic with strict transaction boundary
            ReservationOutcome outcome = reservationService.processOrderCreated(event);
            log.info("OrderCreatedEvent [eventId: {}, orderId: {}] processed with outcome: {}",
                    event.getEventId(), event.getOrderId(), outcome);

            // Acknowledge Kafka message only after database transaction completes and commits
            if (acknowledgment != null) {
                acknowledgment.acknowledge();
            }

        } catch (DataIntegrityViolationException e) {
            log.warn("DataIntegrityViolationException on event ID '{}' for order ID {}. " +
                    "Verifying if event was processed: {}",
                    event.getEventId(), event.getOrderId(), e.getMessage());

            // Check fresh database state after transaction rollback to verify if this event was indeed processed
            boolean confirmedDuplicate = reservationService.isEventProcessed(event.getEventId());
            if (confirmedDuplicate) {
                log.info("Confirmed event ID '{}' was successfully processed and recorded. Acknowledging duplicate delivery.",
                        event.getEventId());
                if (acknowledgment != null) {
                    acknowledgment.acknowledge();
                }
            } else {
                log.error("DataIntegrityViolationException for event ID '{}' is NOT a confirmed duplicate event. " +
                        "Propagating exception for Kafka retry / error handling.", event.getEventId(), e);
                throw e;
            }
        } catch (Exception e) {
            log.error("Transient or technical error processing OrderCreatedEvent [eventId: {}, orderId: {}]. " +
                    "Exception propagated for Kafka retry.", event.getEventId(), event.getOrderId(), e);
            throw e; // Rethrow to allow Kafka retry
        }
    }

    private void sendToDlt(String key, String payload, String reason) {
        log.warn("Routing message to DLT topic '{}'. Key: {}, Reason: {}", orderCreatedDltTopic, key, reason);
        try {
            CompletableFuture<?> future = kafkaTemplate.send(orderCreatedDltTopic, key, payload);
            if (future != null) {
                future.get(5, TimeUnit.SECONDS);
            }
            log.info("Successfully published message to DLT topic '{}' with key '{}'", orderCreatedDltTopic, key);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Interrupted while waiting for DLT publication to topic '{}' with key '{}'", orderCreatedDltTopic, key, e);
            throw new RuntimeException("Interrupted while publishing message to DLT", e);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            if (cause instanceof TimeoutException) {
                log.error("Timed out waiting for DLT publication to topic '{}' with key '{}'", orderCreatedDltTopic, key, e);
                throw new RuntimeException("Timed out publishing message to DLT: " + cause.getMessage(), cause);
            }
            log.error("Failed to publish message to DLT topic '{}' with key '{}': {}", orderCreatedDltTopic, key, cause.getMessage(), e);
            throw new RuntimeException("Failed to publish message to DLT: " + cause.getMessage(), cause);
        } catch (TimeoutException e) {
            log.error("Timed out waiting for DLT publication to topic '{}' with key '{}' after 5000ms", orderCreatedDltTopic, key, e);
            throw new RuntimeException("Timed out publishing message to DLT after 5000ms", e);
        }
    }
}
