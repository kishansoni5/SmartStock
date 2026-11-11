package com.smartstock;

import com.smartstock.modules.auth.model.AppUser;
import com.smartstock.modules.auth.model.UserRole;
import com.smartstock.modules.auth.repository.AppUserRepository;
import com.smartstock.modules.auth.seeder.AdminAccountSeeder;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class AdminAccountSeederTests {

    @Nested
    @SpringBootTest
    @ActiveProfiles("test")
    @Transactional
    @TestPropertySource(properties = {
            "app.admin-seed.enabled=true",
            "app.admin-seed.name=Dev Administrator",
            "app.admin-seed.email=seeded.admin@smartstock.local",
            "app.admin-seed.password=DevAdminPass123!"
    })
    class WhenSeederIsEnabled {

        @Autowired
        private AppUserRepository userRepository;

        @Autowired
        private PasswordEncoder passwordEncoder;

        @Autowired
        private AdminAccountSeeder adminAccountSeeder;

        @Test
        @DisplayName("Seeder creates initial ADMIN account with hashed password and ADMIN role")
        void testAdminAccountSeededSuccessfully() {
            Optional<AppUser> adminOpt = userRepository.findByEmail("seeded.admin@smartstock.local");

            assertThat(adminOpt).isPresent();
            AppUser admin = adminOpt.get();
            assertThat(admin.getName()).isEqualTo("Dev Administrator");
            assertThat(admin.getEmail()).isEqualTo("seeded.admin@smartstock.local");
            assertThat(admin.getRole()).isEqualTo(UserRole.ADMIN);
            assertThat(passwordEncoder.matches("DevAdminPass123!", admin.getPassword())).isTrue();
        }

        @Test
        @DisplayName("Seeder does not duplicate or overwrite existing account if executed again")
        void testSeederDoesNotDuplicateOrOverwrite() {
            long countBefore = userRepository.count();

            // Run seeder manually again
            adminAccountSeeder.run();

            long countAfter = userRepository.count();
            assertThat(countAfter).isEqualTo(countBefore);

            AppUser admin = userRepository.findByEmail("seeded.admin@smartstock.local").orElseThrow();
            assertThat(admin.getName()).isEqualTo("Dev Administrator");
            assertThat(admin.getRole()).isEqualTo(UserRole.ADMIN);
        }
    }

    @Nested
    @SpringBootTest
    @ActiveProfiles("test")
    @Transactional
    @TestPropertySource(properties = {
            "app.admin-seed.enabled=false"
    })
    class WhenSeederIsDisabled {

        @Autowired
        private ApplicationContext applicationContext;

        @Autowired
        private AppUserRepository userRepository;

        @Test
        @DisplayName("Seeder bean is not loaded in Spring Context when app.admin-seed.enabled=false")
        void testSeederBeanNotLoadedWhenDisabled() {
            boolean beanExists = applicationContext.containsBean("adminAccountSeeder");
            assertThat(beanExists).isFalse();
        }

        @Test
        @DisplayName("No admin account is seeded when disabled")
        void testNoAdminAccountCreatedWhenDisabled() {
            assertThat(userRepository.findByEmail("seeded.admin@smartstock.local")).isEmpty();
        }
    }
}
