package com.smartstock.common.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaConfig {

    @Value("${smartstock.kafka.topics.order-created:order.created.v1}")
    private String orderCreatedTopic;

    @Value("${smartstock.kafka.topics.inventory-reserved:inventory.reserved.v1}")
    private String inventoryReservedTopic;

    @Value("${smartstock.kafka.topics.inventory-released:inventory.released.v1}")
    private String inventoryReleasedTopic;

    @Bean
    public NewTopic orderCreatedTopic() {
        return TopicBuilder.name(orderCreatedTopic)
                .partitions(3)
                .replicas(1)
                .build();
    }

    @Bean
    public NewTopic inventoryReservedTopic() {
        return TopicBuilder.name(inventoryReservedTopic)
                .partitions(3)
                .replicas(1)
                .build();
    }

    @Bean
    public NewTopic inventoryReleasedTopic() {
        return TopicBuilder.name(inventoryReleasedTopic)
                .partitions(3)
                .replicas(1)
                .build();
    }
}
