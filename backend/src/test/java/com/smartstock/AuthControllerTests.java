package com.smartstock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartstock.common.security.JwtService;
import com.smartstock.modules.auth.dto.LoginRequest;
import com.smartstock.modules.auth.dto.RegisterRequest;
import com.smartstock.modules.auth.model.AppUser;
import com.smartstock.modules.auth.model.UserRole;
import com.smartstock.modules.auth.repository.AppUserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AuthControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AppUserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
    }

    @Test
    @DisplayName("POST /auth/register - Successfully register a new customer")
    void testCustomerRegistrationSuccess() throws Exception {
        RegisterRequest request = RegisterRequest.builder()
                .name("Alice Wonder")
                .email("alice@smartstock.local")
                .password("password123")
                .build();

        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.message", is("User registered successfully")))
                .andExpect(jsonPath("$.data.token", notNullValue()))
                .andExpect(jsonPath("$.data.tokenType", is("Bearer")))
                .andExpect(jsonPath("$.data.user.email", is("alice@smartstock.local")))
                .andExpect(jsonPath("$.data.user.name", is("Alice Wonder")))
                .andExpect(jsonPath("$.data.user.role", is("CUSTOMER")))
                .andExpect(jsonPath("$.data.user.password").doesNotExist());
    }

    @Test
    @DisplayName("POST /auth/register - Rejects registration when email is duplicated")
    void testRegistrationDuplicateEmailRejected() throws Exception {
        AppUser existingUser = AppUser.builder()
                .name("Existing Customer")
                .email("existing@smartstock.local")
                .password(passwordEncoder.encode("secret123"))
                .role(UserRole.CUSTOMER)
                .build();
        userRepository.save(existingUser);

        RegisterRequest request = RegisterRequest.builder()
                .name("New Attempt")
                .email("existing@smartstock.local")
                .password("newpassword")
                .build();

        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsString("Email is already registered")));
    }

    @Test
    @DisplayName("POST /auth/register - Rejects invalid input fields (Validation)")
    void testRegistrationValidationFailure() throws Exception {
        RegisterRequest request = RegisterRequest.builder()
                .name("")
                .email("not-an-email")
                .password("123")
                .build();

        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", is("Validation failed")))
                .andExpect(jsonPath("$.data.name", notNullValue()))
                .andExpect(jsonPath("$.data.email", notNullValue()))
                .andExpect(jsonPath("$.data.password", notNullValue()));
    }

    @Test
    @DisplayName("POST /auth/login - Successfully authenticate and receive JWT")
    void testLoginSuccess() throws Exception {
        AppUser user = AppUser.builder()
                .name("Bob Buyer")
                .email("bob@smartstock.local")
                .password(passwordEncoder.encode("securePass123"))
                .role(UserRole.CUSTOMER)
                .build();
        userRepository.save(user);

        LoginRequest request = LoginRequest.builder()
                .email("bob@smartstock.local")
                .password("securePass123")
                .build();

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.token", notNullValue()))
                .andExpect(jsonPath("$.data.user.email", is("bob@smartstock.local")))
                .andExpect(jsonPath("$.data.user.role", is("CUSTOMER")));
    }

    @Test
    @DisplayName("POST /auth/login - Rejects invalid credentials with 401")
    void testLoginInvalidCredentialsRejected() throws Exception {
        AppUser user = AppUser.builder()
                .name("Bob Buyer")
                .email("bob@smartstock.local")
                .password(passwordEncoder.encode("correctPassword"))
                .role(UserRole.CUSTOMER)
                .build();
        userRepository.save(user);

        LoginRequest request = LoginRequest.builder()
                .email("bob@smartstock.local")
                .password("wrongPassword")
                .build();

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", is("Invalid email or password")));
    }

    @Test
    @DisplayName("GET /auth/me - Rejects request without JWT token with 401")
    void testProtectedEndpointWithoutJwtRejected() throws Exception {
        mockMvc.perform(get("/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsString("Unauthorized")));
    }

    @Test
    @DisplayName("GET /auth/me - Returns authenticated user details when valid JWT is supplied")
    void testProtectedEndpointWithValidJwtSuccess() throws Exception {
        AppUser user = AppUser.builder()
                .name("Charlie Customer")
                .email("charlie@smartstock.local")
                .password(passwordEncoder.encode("charliePass"))
                .role(UserRole.CUSTOMER)
                .build();
        AppUser savedUser = userRepository.save(user);

        String token = jwtService.generateToken(savedUser.getId(), savedUser.getEmail(), savedUser.getRole().name());

        mockMvc.perform(get("/auth/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.email", is("charlie@smartstock.local")))
                .andExpect(jsonPath("$.data.name", is("Charlie Customer")))
                .andExpect(jsonPath("$.data.role", is("CUSTOMER")))
                .andExpect(jsonPath("$.data.password").doesNotExist());
    }

    @Test
    @DisplayName("RBAC: CUSTOMER cannot access ADMIN-only endpoint (403 Forbidden)")
    void testCustomerCannotAccessAdminEndpoint() throws Exception {
        AppUser customer = AppUser.builder()
                .name("Regular Customer")
                .email("customer@smartstock.local")
                .password(passwordEncoder.encode("customerPass"))
                .role(UserRole.CUSTOMER)
                .build();
        AppUser savedCustomer = userRepository.save(customer);

        String customerToken = jwtService.generateToken(
                savedCustomer.getId(),
                savedCustomer.getEmail(),
                savedCustomer.getRole().name()
        );

        mockMvc.perform(get("/auth/admin/ping")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsStringIgnoringCase("Access denied")));
    }

    @Test
    @DisplayName("RBAC: ADMIN can access ADMIN-only endpoint (200 OK)")
    void testAdminCanAccessAdminEndpoint() throws Exception {
        AppUser admin = AppUser.builder()
                .name("System Admin")
                .email("admin@smartstock.local")
                .password(passwordEncoder.encode("adminPass"))
                .role(UserRole.ADMIN)
                .build();
        AppUser savedAdmin = userRepository.save(admin);

        String adminToken = jwtService.generateToken(
                savedAdmin.getId(),
                savedAdmin.getEmail(),
                savedAdmin.getRole().name()
        );

        mockMvc.perform(get("/auth/admin/ping")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data", containsString("Admin authorized")));
    }
}
