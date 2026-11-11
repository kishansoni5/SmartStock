package com.smartstock.common.event.publisher;

import com.smartstock.common.event.model.OutboxEvent;
import com.smartstock.common.event.model.OutboxStatus;
import com.smartstock.common.event.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Scheduled Transactional Outbox Publisher.
 *
 * Periodically polls PENDING events from outbox_events table, dispatches the stored JSON payload
 * to Apache Kafka using the order ID (aggregateId) as the message partition key, and waits for broker
 * acknowledgment before updating the event status.
 *
 * Concurrency & Transaction Boundary:
 * - This class intentionally DOES NOT hold a database transaction open during Kafka network operations.
 * - Status updates on success or failure are delegated to OutboxEventUpdateService in short, dedicated transactions.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OutboxPublisher {

    private final OutboxEventRepository outboxEventRepository;
    private final OutboxEventUpdateService outboxEventUpdateService;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Value("${smartstock.outbox.publisher.enabled:true}")
    private boolean enabled;

    @Value("${smartstock.outbox.publisher.batch-size:50}")
    private int batchSize;

    @Value("${smartstock.outbox.publisher.send-timeout-seconds:5}")
    private int sendTimeoutSeconds;

    @Value("${smartstock.kafka.topics.order-created:order.created.v1}")
    private String orderCreatedTopic;

    /**
     * Scheduled job entry point.
     * Fixed delay ensures the next cycle only starts after the current cycle completes,
     * preventing overlapping executions in a single publisher instance.
     *
     * @return count of successfully published events in this batch
     */
    @Scheduled(fixedDelayString = "${smartstock.outbox.publisher.fixed-delay-ms:2000}")
    public int publishPendingEvents() {
        if (!enabled) {
            log.trace("Outbox publisher is disabled; skipping execution.");
            return 0;
        }

        Pageable pageable = PageRequest.of(0, Math.max(1, batchSize));
        List<OutboxEvent> pendingEvents = outboxEventRepository.findByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING, pageable);

        if (pendingEvents == null || pendingEvents.isEmpty()) {
            return 0;
        }

        log.debug("Found {} pending outbox event(s) to process", pendingEvents.size());
        int publishedCount = 0;

        for (OutboxEvent event : pendingEvents) {
            boolean success = publishSingleEvent(event);
            if (success) {
                publishedCount++;
            }
        }

        return publishedCount;
    }

    private boolean publishSingleEvent(OutboxEvent event) {
        String topic = resolveTopic(event.getEventType());
        if (topic == null) {
            log.warn("No topic mapped for event type '{}' (outbox ID: {}). Skipping publish.",
                    event.getEventType(), event.getId());
            return false;
        }

        String key = event.getAggregateId();
        String payload = event.getPayload();

        try {
            // Asynchronously dispatch to Kafka broker
            CompletableFuture<SendResult<String, String>> future = kafkaTemplate.send(topic, key, payload);

            // Wait for broker acknowledgment within the configured timeout
            SendResult<String, String> sendResult = future.get(sendTimeoutSeconds, TimeUnit.SECONDS);

            RecordMetadata metadata = sendResult.getRecordMetadata();
            log.info("Successfully published outbox event [id={}, eventId={}, aggregateId={}, topic={}, partition={}, offset={}]",
                    event.getId(), event.getEventId(), event.getAggregateId(),
                    metadata.topic(), metadata.partition(), metadata.offset());

            // Commit status update in a short-lived transaction
            outboxEventUpdateService.markAsPublished(event.getId());
            return true;

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Publishing thread interrupted for outbox event [id={}, eventId={}, aggregateId={}, eventType={}, attempt={}]",
                    event.getId(), event.getEventId(), event.getAggregateId(), event.getEventType(),
                    (event.getAttempts() == null ? 0 : event.getAttempts()) + 1);
            outboxEventUpdateService.markAsFailed(event.getId());
            return false;

        } catch (Exception e) {
            // Never log sensitive payload content
            log.error("Failed to publish outbox event [id={}, eventId={}, aggregateId={}, eventType={}, attempt={}]. Reason: {}",
                    event.getId(), event.getEventId(), event.getAggregateId(), event.getEventType(),
                    (event.getAttempts() == null ? 0 : event.getAttempts()) + 1, e.getMessage());
            outboxEventUpdateService.markAsFailed(event.getId());
            return false;
        }
    }

    private String resolveTopic(String eventType) {
        if ("OrderCreated".equalsIgnoreCase(eventType)) {
            return orderCreatedTopic;
        }
        return null;
    }
}
