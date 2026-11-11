package com.smartstock.modules.auth.seeder;

import com.smartstock.modules.auth.model.AppUser;
import com.smartstock.modules.auth.model.UserRole;
import com.smartstock.modules.auth.repository.AppUserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * Development-only database seeder that creates an initial ADMIN account at startup
 * when explicitly enabled via configuration property 'app.admin-seed.enabled=true'.
 *
 * <p>Never runs in production unless explicitly configured with environment variables.
 * Checks for existing accounts by email before inserting to prevent duplicate records
 * or accidental overwrites.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "app.admin-seed", name = "enabled", havingValue = "true")
@RequiredArgsConstructor
public class AdminAccountSeeder implements CommandLineRunner {

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.admin-seed.name:}")
    private String adminName;

    @Value("${app.admin-seed.email:}")
    private String adminEmail;

    @Value("${app.admin-seed.password:}")
    private String adminPassword;

    @Override
    @Transactional
    public void run(String... args) {
        if (!StringUtils.hasText(adminEmail) || !StringUtils.hasText(adminPassword)) {
            log.warn("ADMIN account seeder is enabled ('app.admin-seed.enabled=true'), but ADMIN_EMAIL or ADMIN_PASSWORD is blank. Skipping seeding.");
            return;
        }

        String normalizedEmail = adminEmail.trim().toLowerCase();
        if (userRepository.existsByEmail(normalizedEmail)) {
            log.info("ADMIN account seeder: User with email '{}' already exists. Skipping account creation.", normalizedEmail);
            return;
        }

        String resolvedName = StringUtils.hasText(adminName) ? adminName.trim() : "System Administrator";

        AppUser admin = AppUser.builder()
                .name(resolvedName)
                .email(normalizedEmail)
                .password(passwordEncoder.encode(adminPassword))
                .role(UserRole.ADMIN)
                .build();

        userRepository.save(admin);
        log.info("ADMIN account seeder: Successfully seeded initial ADMIN account for '{}' ({})", resolvedName, normalizedEmail);
    }
}
