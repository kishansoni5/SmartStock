package com.smartstock.common.event.publisher;

import com.smartstock.common.event.model.OutboxStatus;
import com.smartstock.common.event.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Helper service to execute outbox status updates in isolated, short-lived transactions.
 * This guarantees database transactions are not held open during external Kafka network calls.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OutboxEventUpdateService {

    private final OutboxEventRepository outboxEventRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markAsPublished(Long id) {
        outboxEventRepository.findById(id).ifPresent(event -> {
            event.setStatus(OutboxStatus.PUBLISHED);
            event.setPublishedAt(LocalDateTime.now());
            outboxEventRepository.save(event);
            log.debug("Outbox event ID {} successfully updated to PUBLISHED", id);
        });
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markAsFailed(Long id) {
        outboxEventRepository.findById(id).ifPresent(event -> {
            int currentAttempts = event.getAttempts() == null ? 0 : event.getAttempts();
            int newAttempts = currentAttempts + 1;
            event.setAttempts(newAttempts);
            // Retain status as PENDING so that it remains retryable by subsequent scheduled polling
            event.setStatus(OutboxStatus.PENDING);
            outboxEventRepository.save(event);
            log.debug("Outbox event ID {} attempts incremented to {} (retained as PENDING for retry)", id, newAttempts);
        });
    }
}
