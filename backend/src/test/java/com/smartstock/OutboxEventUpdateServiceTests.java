package com.smartstock;

import com.smartstock.common.event.model.OutboxEvent;
import com.smartstock.common.event.model.OutboxStatus;
import com.smartstock.common.event.publisher.OutboxEventUpdateService;
import com.smartstock.common.event.repository.OutboxEventRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OutboxEventUpdateService Unit Tests")
class OutboxEventUpdateServiceTests {

    @Mock
    private OutboxEventRepository outboxEventRepository;

    @InjectMocks
    private OutboxEventUpdateService updateService;

    @Test
    @DisplayName("markAsPublished should transition status to PUBLISHED and set publishedAt timestamp")
    void markAsPublished_shouldUpdateStatusAndPublishedAt() {
        OutboxEvent event = OutboxEvent.builder()
                .id(10L)
                .eventId(UUID.randomUUID().toString())
                .aggregateId("order-10")
                .eventType("OrderCreated")
                .payload("{}")
                .status(OutboxStatus.PENDING)
                .attempts(0)
                .createdAt(LocalDateTime.now().minusMinutes(1))
                .build();

        when(outboxEventRepository.findById(10L)).thenReturn(Optional.of(event));

        updateService.markAsPublished(10L);

        ArgumentCaptor<OutboxEvent> captor = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventRepository).save(captor.capture());

        OutboxEvent saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(OutboxStatus.PUBLISHED);
        assertThat(saved.getPublishedAt()).isNotNull();
        assertThat(saved.getPublishedAt()).isAfterOrEqualTo(event.getCreatedAt());
    }

    @Test
    @DisplayName("markAsFailed should increment attempts and keep status as PENDING for retry")
    void markAsFailed_shouldIncrementAttemptsAndKeepPending() {
        OutboxEvent event = OutboxEvent.builder()
                .id(20L)
                .eventId(UUID.randomUUID().toString())
                .aggregateId("order-20")
                .eventType("OrderCreated")
                .payload("{}")
                .status(OutboxStatus.PENDING)
                .attempts(1)
                .createdAt(LocalDateTime.now().minusMinutes(2))
                .build();

        when(outboxEventRepository.findById(20L)).thenReturn(Optional.of(event));

        updateService.markAsFailed(20L);

        ArgumentCaptor<OutboxEvent> captor = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventRepository).save(captor.capture());

        OutboxEvent saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(saved.getAttempts()).isEqualTo(2);
        assertThat(saved.getPublishedAt()).isNull();
    }

    @Test
    @DisplayName("markAsFailed with null initial attempts should initialize attempts to 1")
    void markAsFailed_shouldHandleNullAttempts() {
        OutboxEvent event = OutboxEvent.builder()
                .id(30L)
                .eventId(UUID.randomUUID().toString())
                .aggregateId("order-30")
                .eventType("OrderCreated")
                .payload("{}")
                .status(OutboxStatus.PENDING)
                .attempts(null)
                .createdAt(LocalDateTime.now())
                .build();

        when(outboxEventRepository.findById(30L)).thenReturn(Optional.of(event));

        updateService.markAsFailed(30L);

        ArgumentCaptor<OutboxEvent> captor = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventRepository).save(captor.capture());

        OutboxEvent saved = captor.getValue();
        assertThat(saved.getAttempts()).isEqualTo(1);
        assertThat(saved.getStatus()).isEqualTo(OutboxStatus.PENDING);
    }
}
