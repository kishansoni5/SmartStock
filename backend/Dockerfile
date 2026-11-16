# ==============================================================================
# SmartStock Backend - Multi-Stage Production Dockerfile
# Stage 1: Build & Package with Maven and Eclipse Temurin JDK 17
# Stage 2: Minimal Distroless / Alpine JRE 17 Runtime (Non-root user)
# ==============================================================================

# Stage 1: Build
FROM maven:3.9.8-eclipse-temurin-17-alpine AS builder
WORKDIR /build

# Cache Maven dependencies by copying pom.xml first
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy application source code and compile
COPY src ./src
RUN mvn clean package -DskipTests -B

# Stage 2: Runtime
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Install curl/wget for health checking (wget is standard on Alpine)
RUN apk add --no-cache curl tzdata

# Create dedicated non-root application user for zero-trust least privilege
RUN addgroup -S smartstock && adduser -S smartstock -G smartstock

# Copy packaged JAR artifact from builder stage
COPY --from=builder /build/target/*.jar /app/app.jar

# Enforce file ownership
RUN chown -R smartstock:smartstock /app

# Run container as unprivileged user
USER smartstock:smartstock

# Expose internal Spring Boot application port
EXPOSE 8080

# Environment defaults tuned for container memory limits
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=50.0 -Djava.security.egd=file:/dev/./urandom"

# Healthcheck targeting Spring Actuator health endpoint
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD curl -f http://localhost:8080/api/v1/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
