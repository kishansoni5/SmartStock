package com.smartstock.common.event;

import java.time.Instant;

public interface DomainEvent {
    String getEventId();
    Instant getOccurredAt();
    String getEventType();
}
