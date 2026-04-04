# Toon Live — AI Agent Instructions

## Monorepo Structure

Six sub-projects in `/root/git/toon-live/` — each is a **separate git repository**:

| Project | Language | Framework | Port | Purpose |
|---|---|---|---|---|
| `game-api` | Java 21 | Spring Boot 3.2 | 8080 | REST API — auth, inventory, shop, houses |
| `game-server-java` | Java 21 | Spring Boot 3.2 | 8081 | WebSocket STOMP — rooms, avatars, chat |
| `game-web` | TypeScript | Angular 17 | 4200 | SPA frontend |
| `game-core` | TypeScript | Pixi.js 8 + Webpack | — | 2D isometric game engine library (branch: `v2_furniture`) |
| `game-socket` | TypeScript | @stomp/stompjs | — | Typed STOMP client wrapper |
| `game-types` | TypeScript | — | — | Shared types for all TS projects |
| `game-server` | TypeScript | Elysia + Socket.IO | 3001 | Legacy/experimental socket server |

**Bun workspaces**: `game-web`, `game-core`, `game-socket`, `game-types`, `game-server` are linked via `workspace:*` at root. Imports resolve directly to `src/`, no build step needed for shared packages.

---

## Build & Test Commands

### TypeScript

```bash
# Install all TS workspace dependencies (root)
bun install

# game-web
cd game-web && bunx ng serve          # Dev server
cd game-web && bunx ng build          # Production build

# game-core (branch: v2_furniture)
cd game-core && npm run dev           # Webpack dev server
cd game-core && npm run build         # Production bundle
cd game-core && npm run build:lib     # Library build

# game-server (legacy)
cd game-server && bun run dev         # Watch mode
cd game-server && bun run start       # Production

# Tests
cd game-server && bun test
```

### Java (Gradle wrapper)

```bash
# game-api
cd game-api && ./gradlew bootRun              # Dev (hot reload via DevTools)
cd game-api && ./gradlew classes -t           # Continuous recompile (watch)
cd game-api && ./gradlew build                # Production jar
cd game-api && ./gradlew test                 # All tests
cd game-api && ./gradlew test --tests FooTest # Single test class

# game-server-java (same pattern)
cd game-server-java && ./gradlew bootRun
cd game-server-java && ./gradlew classes -t
cd game-server-java && ./gradlew test
```

### Make targets (root)

```bash
make dev            # Launch all services in tmux (DB + API + Server + Web)
make dev-kill       # Stop tmux session
make dev-db         # Only PostgreSQL + Adminer (localhost:8888)
make dev-api        # Only game-api
make dev-server     # Only game-server-java
make dev-web        # Only game-web
make watch-api      # Recompile watch for game-api
make watch-server   # Recompile watch for game-server-java
make prod           # Docker Compose (production images)
make prod-build     # Build Docker images
```

---

## Database

- **PostgreSQL 16** (Docker), DB: `toonlive`, user: `postgres`, password: `postgres`
- **Flyway migrations** managed exclusively by `game-api` (V1→V12 currently)
  - Location: `game-api/src/main/resources/db/migration/`
  - **Never run Flyway from `game-server-java`** — it has `flyway.enabled: false`
- `game-server-java` uses `jpa.hibernate.ddl-auto: validate` — crashes if schema is out of date
- **Always start `game-api` before `game-server-java`** so migrations run first

### Naming conventions (DB)
- Tables and columns: `snake_case`
- IDs: `IDENTITY` auto-increment `Long` (or UUID for `users.id`)
- Timestamps: `OffsetDateTime` + `@CreationTimestamp`, column `created_at`

### Adding a migration
1. Create `game-api/src/main/resources/db/migration/V{N+1}__description.sql`
2. Never modify or renumber existing migrations
3. For `jsonb` columns, add `@JdbcTypeCode(SqlTypes.JSON)` on the Java entity field

---

## Java Conventions (`game-api`, `game-server-java`)

### Entities
```java
@Entity
@Table(name = "rooms")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Room {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 64)
    private String name;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;
}
```

- Use `@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder` (Lombok)
- Relations: explicit `@ManyToOne @JoinColumn` / `@OneToMany`
- JSON columns: `@JdbcTypeCode(SqlTypes.JSON)` (Hibernate 6 / PostgreSQL jsonb)

### Services
```java
@Service
@RequiredArgsConstructor          // Lombok constructor injection
public class ShopService {
    private final ShopItemRepository shopItemRepository;

    @Transactional
    public void buyItem(Long userId, Long itemId) { ... }
}
```

### Controllers (REST)
```java
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/shops")
public class ShopController {
    private final ShopService shopService;

    @GetMapping("/{shopId}/collections")
    public ResponseEntity<List<CollectionDto>> listCollections(@PathVariable Long shopId) { ... }
}
```

### Controllers (STOMP)
```java
@Controller
@RequiredArgsConstructor
public class RoomStompController {
    @MessageMapping("/join")
    @SendToUser("/queue/roomState")
    public RoomStateEvent join(JoinPayload payload, Principal principal) { ... }
}
```

### DTOs
- Inbound STOMP: `*Payload` — `@Data @Builder`
- Outbound STOMP events: `*Event` — `@Data @Builder`
- REST response: `*Dto` or `*Response` — `@Data @Builder`
- Never expose entities directly to clients

### Security (Spring)
- Public REST routes must be explicitly declared in `SecurityConfig.securityFilterChain`
- JWT validated via `JwtChannelInterceptor` at STOMP CONNECT level
- `UserPrincipal implements Principal`, `getName()` returns `userId.toString()`

### Tests (JUnit 5 + Mockito)
- Controller tests: `@WebMvcTest`, `MockMvc`, `@MockBean`
- Service tests: `@ExtendWith(MockitoExtension.class)`, `@Mock`, `@InjectMocks`
- Run with: `./gradlew test`

---

## TypeScript / Angular Conventions (`game-web`, `game-types`, `game-socket`)

### game-types — shared models
- All shared interfaces and types live in `game-types/src/models.ts` (or sub-files)
- Imported as `@toon-live/game-types` in all other TS projects
- When adding a field to a shared type, update `game-types` first, then consumers

### Angular services (game-web)
```typescript
@Injectable({ providedIn: 'root' })
export class ShopService {
  constructor(private http: HttpClient) {}

  listCollections(shopId: number): Observable<CollectionInfo[]> {
    return this.http.get<CollectionInfo[]>(`/api/shops/${shopId}/collections`);
  }
}
```

### Angular components (standalone, signals)
```typescript
@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shop.component.html',
  styleUrls: ['./shop.component.scss'],
})
export class ShopComponent {
  readonly collections = signal<CollectionInfo[]>([]);
  readonly activeCollection = signal<number | null>(null);

  constructor(private shopService: ShopService) {
    effect(() => { /* reactive side effects */ });
  }
}
```

- **Always standalone components** (no NgModules)
- Prefer **signals** over BehaviorSubject for component state
- Use `computed()` for derived values, `effect()` for side effects

### game-socket
```typescript
const gs = new GameSocket({ serverUrl: 'http://localhost:8081', token: () => token });
gs.on('roomState', (state: RoomState) => { ... });
gs.connect();
```
- Event names and payload types defined in `EventMap` (in `game-socket/src/`)
- Move events throttled at 50ms to prevent event spam

---

## Environment Variables (`.env` at root)

```env
DB_NAME=toonlive
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=toon-live-super-secret-jwt-key-change-in-prod!
CORS_ORIGINS=http://localhost:4200
PORT=3001
```

- `JWT_SECRET` **must be identical** in `game-api` and `game-server-java`; mismatch causes silent STOMP auth failures
- `CORS_ORIGINS` is injected into `game-server-java` `SecurityConfig` via `${cors.allowed-origins}`

---

## Architecture Decisions

1. **STOMP over WebSocket** for real-time (not raw Socket.IO). Topics: `/topic/*` (broadcast), `/queue/*` (user-specific), destinations: `/app/*`
2. **In-memory room registry** in `game-server-java` (`ConcurrentHashMap`): `sessionId → room`, `userId → sessionId`. Synced to DB for persistence.
3. **Shared DB, separate responsibilities**: `game-api` owns schema + migrations; `game-server-java` updates presence only (`user.online`, `user.current_room_id`, `room.user_count`)
4. **Duplicate session eviction**: reconnect from another browser kicks the old session via `/queue/kicked-user{sessionId}` with a `KickedEvent`
5. **Presence reset on boot**: `@PostConstruct resetPresenceOnStartup()` clears all `user.online = false` when `game-server-java` starts

---

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| STOMP connections fail with 401 | Check `JWT_SECRET` is identical in both Java apps |
| `game-server-java` crashes on startup | Run `game-api` first — Flyway migration may be missing |
| Users appear online after server crash | `resetPresenceOnStartup()` handles this on boot |
| Multiple avatars per user | Session eviction logic in `RoomStateService.join()` |
| Missing Jackson annotation on enum | Use `@JsonValue` on enum field or `@JsonProperty` on cases |
| `jsonb` column not mapped in Hibernate 6 | Add `@JdbcTypeCode(SqlTypes.JSON)` to the entity field |
| New REST endpoint returns 403 | Declare it public in `SecurityConfig.securityFilterChain` |
| Angular build fails after `game-types` change | Run `bun install` at root to re-link workspace packages |

---

## Git Workflow

- Each sub-project is an **independent git repository** with its own remote
- Commit and push each project separately (`cd game-api && git push`, etc.)
- `game-core` is on branch `v2_furniture` (not `main`)
- No monorepo-level git; the root folder is not itself a git repo
