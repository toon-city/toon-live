# Toon Live — AI Project Context

> Auto-generated from codebase analysis. Last update: 2026-03-24.
> Use this file as context when asking an AI assistant to work on this project.

---

## 0. Copilot Instructions

This section contains mandatory rules for GitHub Copilot when generating code in this project.
**Read this section before generating any code.**

### 0.1 Project Identity
- Monorepo with two independent Java backends (`live.toon.api` / `live.toon.server`) and three TypeScript frontends
- Never mix Spring Boot API code into game-server-java and vice versa — they are separate Gradle projects
- TypeScript packages are NOT compiled: they are imported directly as `.ts` files via workspace aliases
- The shared type contract lives in `game-types` — never duplicate types locally in game-web or game-admin

### 0.2 Strict Code Generation Rules

#### Java / Spring Boot
| Rule | Detail |
|---|---|
| **Always `@RequiredArgsConstructor`** | Never use `@Autowired` — use Lombok constructor injection exclusively |
| **Always `FetchType.LAZY`** | On every `@ManyToOne`, `@OneToMany`, `@ManyToMany` |
| **Always `@Builder.Default`** | On every Lombok builder field that has a default value |
| **`@Transactional` in services only** | Never on controllers or repositories |
| **`OffsetDateTime` for all timestamps** | Never `LocalDateTime` or `Date` — Jackson serializes to ISO-8601 string |
| **`ResponseEntity<T>` on all controller methods** | Never return raw `T` from `@RestController` methods |
| **`record` for request DTOs** | `public record MyRequest(String field, int value) {}` — NOT `@Data` class |
| **`@Data @Builder` for response DTOs** | With explicit `@NoArgsConstructor @AllArgsConstructor` when needed |
| **Schema changes via Flyway only** | Create `V{n+1}__{description}.sql` — never modify `ddl-auto` or existing migrations |
| **`@PreAuthorize` at method level** | Not via `SecurityFilterChain` rules — use `hasRole('ROLE_ADMIN')` or `hasAnyRole(...)` |
| **UUID for user IDs** | `UUID` type in Java, string UUID in TypeScript — never `Long` for users |
| **`Long` / `BIGSERIAL` for entity IDs** | Rooms, items, shop_items, chat_messages — not UUID |
| **Never `SELECT *` in JPQL** | Use named fields or Spring Data method names |
| **Page size cap** | Always `Math.min(size, 50)` when accepting user-provided page size |

#### TypeScript / Angular
| Rule | Detail |
|---|---|
| **Always `standalone: true`** | No NgModules — ever |
| **Always `inject()` for DI** | Never constructor parameter injection in Angular components/services |
| **`signal()` for mutable state** | NOT `BehaviorSubject` — signals are the state primitive |
| **`Subject<T>` for event streams only** | `userJoined$`, `chatMessage$` etc. — not for state |
| **`loadComponent: () => import(...)` on routes** | All feature routes must be lazy — no eager imports in app.routes.ts |
| **`Observable<T>` for HTTP calls** | Never `.toPromise()` — subscribe in component or use `async` pipe |
| **`Page<T>` wrapper for paginated responses** | Never assume array — always `page.content ?? []` |
| **`environment.apiUrl`** | Never hardcode `http://localhost:8080` in services |
| **`HttpParams`** for optional query params** | Build params conditionally — never concatenate null into URL strings |
| **No `any`** | Use proper types from `@toon-live/game-types` or `models.ts` |
| **SCSS per component** | Always 3 files: `.ts` / `.html` / `.scss` — no inline styles except `styles: [':host{...}']` for trivial wrappers |

#### game-core (PixiJS)
| Rule | Detail |
|---|---|
| **Singletons via `getInstance()`** | `GameItemManager`, `FurnitureBaseManager` — never `new` them directly |
| **`AssetBaseUrl.resolve(path)`** | For all asset URL construction |
| **`Container` as base** | Game objects extend `Container`, not raw `Sprite` |
| **Async asset loading** | Always `await Assets.load(uri)` before `Assets.get(uri)` |

### 0.3 Detected Implicit Conventions

#### Naming
- **Java packages**: `live.toon.api.*` (REST API) vs `live.toon.server.*` (WebSocket server) — never cross-import
- **DTO suffix**: `*Dto` for response objects (e.g. `AdminUserDto`), `*Request` record for inputs
- **Service prefix**: `Admin*Service` for admin-only services (`AdminUserService`, `AdminStatsService`)
- **Controller URL prefix**: `/api/*` for public/auth, `/api/admin/*` for protected admin routes
- **Angular files**: always triple `feature.component.ts` + `.html` + `.scss` — no exceptions
- **Angular services**: `*Service` suffix, `providedIn: 'root'`, `private readonly base = environment.apiUrl + '/api/...'`
- **Angular guards**: functional (`export const authGuard: CanActivateFn = ...`), not class-based
- **Flyway**: `V{n}__{snake_case_description}.sql` — double underscore, no spaces, sequential integer

#### Java patterns
- **Controller methods are thin**: validate auth via `@PreAuthorize`, call exactly one service method, wrap in `ResponseEntity.ok()`
- **Service methods own the transaction**: `@Transactional` on service method, not propagated sideways
- **`JwtPrincipal` is the auth object**: `@AuthenticationPrincipal JwtPrincipal actor` — `actor.getUserId()` returns `UUID`
- **Enum columns**: `@Enumerated(EnumType.STRING)` always — never `ORDINAL`
- **Boolean columns**: snake_case in DB (`locked`, `banned`, `online`), camelCase in Java (`isLocked()` → `locked` via Lombok)
- **Soft ban pattern**: `banned + banReason + bannedAt + bannedById` columns — never delete banned users

#### TypeScript patterns
- **Auth state**: `_token = signal<string|null>()` + `_user = signal<UserInfo|null>()` in `AuthService` — localStorage-backed
- **JWT decode client-side**: `atob(base64Url.replaceAll('-','+').replaceAll('_','/').padEnd(...,'='))` — for UX only, never for security
- **Component loading pattern**: `loading = signal(false)` → set true before call → set false in both `next` and `error`
- **Table pagination**: use `totalElements` from `Page<T>`, pass `page` as 0-based integer to service
- **Admin guards**: `adminGuard` checks `rank >= 2`, `authGuard` checks token validity only
- **Signal readonly exposure**: `readonly token = this._token.asReadonly()` — internal mutations via `_token.set()`

#### Domain-specific conventions
- **Currency display**: pez displayed as integer (e.g. `1500 Pez`), kreds as integer (e.g. `500 K`)
- **Price in centimes**: `priceCents=499` → display as `4,99 €` — never store fractional euros
- **Room ID is string in WebSocket context** but `Long` in REST API — due to STOMP payload serialization
- **`houseData` is JSON string** (not object) — parse client-side with `JSON.parse(room.houseData)`
- **Avatar direction**: 1–8 (isometric octants), stored as integer in `avatarOptions.direction`
- **`possessable=false` items**: never create a `user_items` row — apply effect directly (e.g. hairstyle)
- **Shop item pricing duality**: `pezPrice + kredBonus` (pez option) OR `kredPrice` (kreds option) — both can be set simultaneously
- **Presence reset on startup**: `@PostConstruct` in `RoomStateService` — always reset `online=false` / `user_count=0`

---

## 1. Project Overview

**Toon Live** is a browser-based multiplayer online world (Habbo Hotel-inspired).
Players control 2D isometric avatars that navigate rooms, chat, place furniture, and purchase
cosmetic items (clothes, furniture) from themed shops using two in-game currencies.

Key user flows:
1. Register / login → JWT issued
2. Browse lobby → enter a public room or a private house
3. In-room: move avatar, chat, place/move/rotate furniture
4. Wardrobe: buy items from shops → equip clothes → avatar appearance updated live
5. Kreds: purchase kreds packages (real money) → spend kreds in shop
6. Admin panel: manage users, rooms, items, shops, stats (port 4201)

---

## 2. Tech Stack

### Backend
| Layer | Technology |
|---|---|
| REST API | Spring Boot 3.2.3, Java 21, Gradle 8 |
| WebSocket server | Spring Boot 3.2.3, Java 21, STOMP over WebSocket |
| ORM | Spring Data JPA + Hibernate 6, `ddl-auto: validate` |
| Database | PostgreSQL 16 (`pgcrypto` extension, `uuid` PK for users) |
| Migrations | Flyway (V1 → V14, `classpath:db/migration`) |
| Auth | JWT HS-256 / jjwt, 24h expiry, BCrypt passwords |
| Security | Spring Security 6, `@PreAuthorize`, custom `JwtAuthFilter`, stateless (no sessions) |
| Containerization | Docker multi-stage (OpenJDK), docker-compose |

### Frontend — game-web (player client)
| Layer | Technology |
|---|---|
| Framework | Angular 17.3, standalone components |
| Rendering | PixiJS 8.2.5 (WebGL canvas) |
| UI | Angular Material 17 |
| State | Angular Signals (`signal()`, `computed()`) |
| HTTP | `HttpClient` + HTTP interceptor for JWT injection |
| WebSocket | `@stomp/stompjs` via `GameSocket` wrapper |
| Package manager | Bun (workspace) |

### Frontend — game-admin (admin panel)
| Layer | Technology |
|---|---|
| Framework | Angular 17.3, standalone components |
| UI | PrimeNG 17 + PrimeFlex 3 |
| Charts | Chart.js 4 |
| State | Angular Signals |
| Port | 4201 |

### Shared packages (TypeScript monorepo)
| Package | Role |
|---|---|
| `@toon-live/game-types` | Shared domain types, STOMP destinations, event payloads |
| `@toon-live/game-socket` | `GameSocket` class — thin STOMP adapter |
| `game-core` | PixiJS rendering engine (avatar, rooms, furniture, loading) |

### Assets server
| Layer | Technology |
|---|---|
| Static serving | Nginx (port 3001) |
| Upload API | Bun TypeScript (port 3002) |
| Auth | JWT verification (same secret as game-api), requires `ROLE_ADMIN` or `ROLE_MODERATOR` |

---

## 3. Repository Structure

```
toon-live/                          ← monorepo root (Bun workspaces)
├── package.json                    ← workspaces: game-core, game-types, game-socket, game-web
├── bun.lockb
├── docker-compose.yml              ← prod: postgres, game-api, game-server, game-assets, game-admin
├── docker-compose.dev.yml          ← dev: postgres + Adminer only
├── Makefile                        ← dev targets (dev, dev-api, dev-server, dev-web, dev-admin, prod…)
├── dev.sh                          ← tmux launcher (windows: db[0], api[1], server[2], web[3], admin[4])
├── docs/
│   └── ai-context.md               ← THIS FILE
│
├── game-api/                       ← REST API (Spring Boot, port 8080)
│   └── src/main/java/live/toon/api/
│       ├── config/                 ← SecurityConfig, GlobalExceptionHandler
│       ├── controller/             ← 15 controllers (see §5)
│       ├── dto/                    ← ~30 DTOs / request records
│       ├── entity/                 ← 20 JPA entities
│       ├── repository/             ← 14 Spring Data repos
│       ├── security/               ← JwtAuthFilter, JwtPrincipal, UserRank, policy/
│       └── service/                ← 13 services
│
├── game-server-java/               ← STOMP WebSocket server (Spring Boot, port 8081)
│   └── src/main/java/live/toon/server/
│       ├── config/                 ← SecurityConfig, WebSocketConfig
│       ├── controller/             ← RoomStompController, DisconnectListener, StatsController
│       ├── dto/                    ← payloads (client→server) + event/ (server→client)
│       ├── entity/                 ← Room, User, ChatMessage (read-only mirror from DB)
│       ├── model/                  ← ConnectedUser (in-memory), UserPrincipal
│       ├── repository/             ← RoomRepository, UserRepository, ChatMessageRepository
│       ├── security/               ← JwtChannelInterceptor, JwtService
│       └── service/                ← RoomStateService (in-memory registry), ChatService
│
├── game-types/                     ← Shared TS types (no build step, direct TS import)
│   └── src/
│       ├── models.ts               ← domain models (UserInfo, RoomState, ItemInfo, ShopItemInfo…)
│       ├── events.ts               ← StompDest const, all payload interfaces
│       ├── permissions.ts          ← RoomPermission enum (VIEW=0, EDIT=1, OWN=2)
│       └── common.ts               ← Point, shared utilities
│
├── game-socket/                    ← GameSocket class (STOMP adapter)
│   └── src/
│       ├── GameSocket.ts           ← typed event emitter wrapping @stomp/stompjs
│       └── index.ts
│
├── game-core/                      ← PixiJS rendering engine (library, no framework)
│   └── src/
│       ├── GameCore.ts             ← main entry (house rendering, avatar, furniture, camera)
│       ├── game/
│       │   ├── avatar/             ← Avatar class, body parts, clothing system
│       │   └── textures/           ← GameItemManager, BaseTextureLoader
│       ├── modules/
│       │   ├── furniture/          ← FurnitureController, FurnitureView
│       │   └── house/              ← HouseParser, HouseView, AreaView, WallView, DoorView
│       └── core/
│           ├── manager/            ← FurnitureBaseManager
│           └── models/             ← Furniture, FurnitureBase, Area, Door, Wall, House
│
├── game-web/                       ← Angular player client (port 4200)
│   └── src/app/
│       ├── core/
│       │   ├── services/           ← auth, socket, shop, house, inventory, deditoon, stats, user-list
│       │   ├── guards/             ← authGuard, guestGuard
│       │   └── interceptors/       ← authInterceptor (Bearer token injection)
│       ├── features/
│       │   ├── login/              ← LoginComponent
│       │   ├── lobby/              ← LobbyComponent + create/enter house dialogs
│       │   └── game/               ← GameComponent (route /room/:roomId)
│       │       └── components/
│       │           ├── game-canvas/← GameCanvasComponent (PixiJS + GameCore integration)
│       │           ├── chat/       ← ChatComponent
│       │           └── user-list/  ← UserListComponent
│       └── shared/components/      ← GameMenu, Shop, Inventory, IdentityCard, Navigator, StatusBar
│
├── game-admin/                     ← Angular admin panel (port 4201)
│   └── src/app/
│       ├── core/
│       │   ├── models/models.ts    ← admin-side DTOs (mirrors backend)
│       │   ├── services/           ← auth, admin-users, admin-rooms, admin-items,
│       │   │                          admin-shops, admin-chat, stats, kreds
│       │   ├── guards/             ← authGuard, adminGuard
│       │   └── interceptors/       ← authInterceptor
│       └── features/
│           ├── login/              ← LoginComponent
│           ├── dashboard/          ← DashboardComponent (charts, KPIs)
│           ├── users/              ← UsersListComponent, UserDetailComponent, BannedUsersComponent
│           ├── chat/               ← ChatLogsComponent
│           ├── rooms/              ← RoomsComponent (lock/unlock/kickAll/delete)
│           ├── items/              ← ItemsComponent (CRUD catalogue)
│           ├── shops/              ← ShopEditorComponent (items + collections tabs)
│           └── kreds/             ← KredsPackagesComponent (CRUD packages)
│
└── game-assets/                    ← Static assets + upload server
    ├── nginx.conf                  ← serve /usr/share/nginx/html, port 80
    ├── supervisord.conf            ← runs nginx + bun simultaneously
    ├── src/server.ts               ← Bun upload server (port 3002)
    └── public/                     ← served at port 3001 (clothes/, furnitures/, textures/, toon/)
```

---

## 4. Domain Knowledge

### Currencies
| Name | Symbol | Purpose | Source |
|---|---|---|---|
| **Pez** | PEZ | Free in-game currency | Earned by playing, default 1500 |
| **Kreds** | KREDS | Premium currency | Purchased with real money |

### User Ranks
```java
ROLE_USER      = 0  // default
ROLE_MODERATOR = 1  // can access admin panel, ban users, manage chat
ROLE_ADMIN     = 2  // full access, can change ranks, manage items/shops/kreds
```
Stored as `int rank` in DB. JWT claims contain `rank` as integer.
Spring Security role: `UserRank.fromRank(int)` → `ROLE_USER / ROLE_MODERATOR / ROLE_ADMIN`.

### Tooniz System
`toonizLevel: 0–3` — badge/premium tier. Level 0 = none, 1/2/3 = increasing subscription tier.

### Gender
Enum: `MALE | FEMALE | NON_BINARY | null` (null = not set).

### Rooms
- **Public rooms** (`RoomType.PUBLIC`): listed in lobby, accessible to all
- **Private houses** (`RoomType.PRIVATE`): owned by a user, can set access policy

House access policies:
```
OPEN     → anyone can enter
PASSWORD → requires password
CLOSED   → only owner/editor
```
`houseData` is a JSON string (formerly XML) defining the isometric room layout.
`locked = true` means an admin has locked the room (owner cannot unlock).

### Room Permissions
```typescript
VIEW = 0   // can only observe
EDIT = 1   // can move/place/remove furniture
OWN  = 2   // full control + house XML + manage users
```

### Items & Shop System
```
ItemType:    FURNITURE | CLOTHING | MISC
ItemSubType: FLOOR | WALL | WALLPAPER | PIECE       (furniture)
             HAIRSTYLE | HAT | TOP | BOTTOM | MAKEUP (clothing)
             OTHER
```

**Shops** (enum `ShopId`): `COUPE_TIFF` | `IKEBO` | `VESTIS`

Shop item pricing model (two independent purchase options):
- **Pez option**: `pezPrice` pez + `kredBonus` kreds (kredBonus=0 → pez-only)
- **Kreds option**: `kredPrice` kreds (null → not available in kreds)

`possessable = false` → item not stored in user_items (e.g. hairstyles applied live).

### Collections
Items in a shop can be grouped into named collections (`ItemCollection`):
`shopId, name, bannerImage, sortOrder, enabled`.

### Avatar Options
Stored as JSONB in `users.avatar_options`:
```typescript
interface AvatarOptions {
  direction?: number;   // 1–8 (isometric directions)
  skinColor?: number;
  clothing?: Record<string, string>;  // spriteKey → spriteJsonPath
}
```

### Deditoons
Short public messages with author reference (`Deditoon` entity). Listed publicly.

### Kreds Packages (real purchases)
```
name, kredsAmount, priceCents (centimes), currency (3-char ISO), active
```
Example: `500 kreds = 4,99 €` → `kredAmount=500, priceCents=499, currency="EUR"`.

---

## 5. API Reference

### game-api (port 8080) — REST

#### Public endpoints (no token required)
```
POST /api/auth/register           { username, password, email, gender? } → AuthResponse
POST /api/auth/token              { username, password } → AuthResponse
GET  /api/auth/me                 → AuthResponse (refreshed)
GET  /api/stats                   → StatsDto (global stats)
GET  /api/rooms                   → RoomDto[]
GET  /api/rooms/paged?q&page      → Page<RoomDto>
GET  /api/rooms/{id}              → RoomDto
GET  /api/houses?page             → Page<HouseInfo>
GET  /api/house-schemas           → HouseSchemaDto[]
GET  /api/users?q&page&size       → UserPageResponse
GET  /api/deditoons               → DeditoonDto[]
GET  /api/shops/{shopId}/items?collectionId&page → Page<ShopItemDto>
GET  /api/shops/{shopId}/collections → CollectionDto[]
```

#### Authenticated endpoints (`Authorization: Bearer <token>`)
```
GET  /api/rooms/{id}/chat?limit   → ChatMessageDto[]
POST /api/shops/{shopId}/items/{id}/buy  { option: 'PEZ'|'KREDS' } → UserItemDto
GET  /api/inventory?type&page     → Page<UserItemDto>
PUT  /api/inventory/{id}/equip    → UserItemDto
PUT  /api/inventory/{id}/unequip  → UserItemDto
POST /api/users/me/avatar         { avatarOptionsJson: string } → UserDto
GET  /api/kreds/packages          → KredsPackageDto[]
POST /api/kreds/purchase          { packageId } → KredsPackageDto
POST /api/houses                  { name, schemaId?, access, password? } → HouseDto
GET  /api/houses/{id}             → HouseDto
PUT  /api/houses/{id}             HouseRequest → HouseDto
POST /api/deditoons               { message } → DeditoonDto
```

#### Moderator endpoints (`ROLE_MODERATOR` or `ROLE_ADMIN`)
```
GET  /api/admin/users?search&banned&page         → Page<AdminUserDto>
GET  /api/admin/users/{id}                       → AdminUserDto
POST /api/admin/users/{id}/ban   { reason }      → AdminUserDto
POST /api/admin/users/{id}/unban                 → AdminUserDto
GET  /api/admin/chat?roomId&userId&page          → Page<ChatMessageDto>
DELETE /api/admin/chat/{id}                      → 204
GET  /api/admin/rooms?page                       → Page<AdminRoomDto>
GET  /api/admin/rooms/{id}                       → AdminRoomDto
POST /api/admin/rooms/{id}/lock                  → AdminRoomDto
POST /api/admin/rooms/{id}/unlock                → AdminRoomDto
POST /api/admin/rooms/{id}/kick-all              → 204
```

#### Admin-only endpoints (`ROLE_ADMIN`)
```
PUT  /api/admin/users/{id}/rank  { rank: int }   → AdminUserDto
DELETE /api/admin/rooms/{id}                     → 204
PUT  /api/admin/rooms/{id}       AdminRoomUpdateRequest → AdminRoomDto
GET  /api/admin/items?search&type&page           → Page<ItemDto>
GET  /api/admin/items/{id}                       → ItemDto
POST /api/admin/items            AdminItemRequest → ItemDto
PUT  /api/admin/items/{id}       AdminItemRequest → ItemDto
DELETE /api/admin/items/{id}                     → 204
GET  /api/admin/shops/{shopId}/items?page        → Page<ShopItemDto>
POST /api/admin/shops/items      AdminShopItemRequest → ShopItemDto
PUT  /api/admin/shops/items/{id} AdminShopItemRequest → ShopItemDto
DELETE /api/admin/shops/items/{id}               → 204
GET  /api/admin/shops/{shopId}/collections       → CollectionDto[]
POST /api/admin/shops/collections AdminCollectionRequest → CollectionDto
PUT  /api/admin/shops/collections/{id} AdminCollectionRequest → CollectionDto
DELETE /api/admin/shops/collections/{id}         → 204
GET  /api/admin/stats/dashboard                  → DashboardDto
GET  /api/admin/stats/series?metric&from&to&granularity → TimeSeriesDto
GET  /api/admin/stats/top-items?limit&from&to    → TopItemDto[]
GET  /api/admin/stats/top-users?limit&from&to    → TopUserDto[]
GET  /api/admin/kreds/packages?page              → Page<KredsPackageDto>
POST /api/admin/kreds/packages   KredsPackageDto → KredsPackageDto
PUT  /api/admin/kreds/packages/{id} KredsPackageDto → KredsPackageDto
DELETE /api/admin/kreds/packages/{id}            → 204
```

### game-server-java (port 8081) — STOMP over WebSocket

Connection URL: `ws://localhost:8081/ws`
Auth: STOMP `connect` header `Authorization: Bearer <token>` validated by `JwtChannelInterceptor`.

#### Client → Server (`/app` prefix)
```
/app/join            { roomId } → sends RoomStateEvent to /user/queue/state
/app/leave           { roomId }
/app/avatar/move     { x, y, direction }
/app/avatar/say      { text }
/app/chat            { text }
/app/furniture/place  { baseId, x, y, orientation }
/app/furniture/move   { instanceId, x, y }
/app/furniture/rotate { instanceId, orientation }
/app/furniture/remove { instanceId }
```

#### Server → Client broadcasts (per-room topic `/topic/room/{roomId}/`)
```
joined          UserJoinedEvent
left            UserLeftEvent
avatar-move     AvatarMoveEvent
avatar-say      AvatarSayEvent
chat            ChatEvent
furniture-place FurniturePlaceEvent
furniture-move  FurnitureMoveEvent
furniture-rotate FurnitureRotateEvent
furniture-remove FurnitureRemoveEvent
```

#### Server → Client private (`/user/queue/`)
```
/user/queue/state    RoomStateEvent  (sent after /app/join)
/user/queue/error    ErrorEvent      { code, message }
/user/queue/kicked   KickedEvent     (admin kick or duplicate session)
```

### game-assets (port 3001/3002)
```
GET  /                        serves public/ folder (static)
GET  /furnitures/{name}.json  furniture definition JSON
GET  /clothes/{type}/{name}.json  clothing sprite JSON
GET  /textures/floors/{file}  floor textures
GET  /toon/toon.json          base avatar definition
POST /upload                  multipart form (file + path), requires Bearer ADMIN/MOD
GET  /health                  healthcheck (no auth)
```

---

## 6. Data Structures

### JWT Claims (HS256)
```json
{
  "sub": "<userId UUID>",
  "username": "string",
  "gender": "MALE|FEMALE|NON_BINARY|null",
  "rank": 0,
  "toonizLevel": 0,
  "iat": 1700000000,
  "exp": 1700086400
}
```
Expiry: 24h (`86400000 ms`). Secret via `JWT_SECRET` env var (min 32 chars).

### AuthResponse (login / register / me)
```typescript
{
  token: string;
  userId: string;        // UUID
  username: string;
  gender: string | null;
  rank: number;          // 0|1|2
  toonizLevel: number;   // 0|1|2|3
  kreds: number;
  pez: number;
  avatarOptionsJson?: string;  // JSON string of AvatarOptions
}
```

### AdminUserDto
```typescript
{
  id: UUID; username: string; email: string|null; gender: string|null;
  rank: number; toonizLevel: number; kreds: number; pez: number;
  online: boolean; banned: boolean; banReason: string|null;
  bannedAt: OffsetDateTime|null; bannedById: UUID|null; bannedByUsername: string|null;
  createdAt: OffsetDateTime; lastLoginAt: OffsetDateTime|null;
}
```
> ⚠️ Field is `kreds` (NOT `kredsBalance`) and `lastLoginAt` (NOT `lastLogin`).

### AdminRoomDto
```typescript
{
  id: number; name: string; type: 'PUBLIC'|'PRIVATE'; access: 'OPEN'|'PASSWORD'|'CLOSED';
  userCount: number; maxUsers: number; locked: boolean;
  owner: AdminUserDto|null; createdAt: OffsetDateTime;
}
```
> ⚠️ Field is `userCount` (NOT `currentUsers`). `owner` is a nested `AdminUserDto`.

### AdminRoomUpdateRequest
```typescript
{ name?: string; type?: string; access?: string; houseData?: string; ownerId?: UUID; maxUsers?: number }
```
> ⚠️ NO `locked` field in update request (lock via dedicated endpoints).

### ItemDto / AdminItemRequest
```typescript
// ItemDto (response)
{
  id: number; name: string; itemType: ItemType; subType: ItemSubType;
  possessable: boolean; displayImage: string|null;
  spritePath: string|null; spriteKey: string|null;
  createdAt: OffsetDateTime;
}
// AdminItemRequest (record — create/update)
{ name, itemType, subType, possessable, displayImage, spritePath, spriteKey }
```
> ⚠️ No `type`, `rarity`, `assetPath`, or `defaultPrice` fields — these do not exist.

### ShopItemDto / AdminShopItemRequest
```typescript
// ShopItemDto (response) — item is NESTED
{
  id: number; item: ItemDto; shopId: ShopIdType;
  pezPrice: number|null; kredBonus: number; kredPrice: number|null;
  collectionId: number|null; stock: number|null;
}
// AdminShopItemRequest (record)
{ itemId, shopId, pezPrice, kredBonus, kredPrice, available, stock, collectionId }
```
> ⚠️ Access item fields as `shopItem.item.name`, `shopItem.item.itemType` (NOT flat).

### CollectionDto / AdminCollectionRequest
```typescript
{ id: number; shopId: ShopIdType; name: string; bannerImage: string|null; sortOrder: number; enabled: boolean }
{ shopId, name, bannerImage, sortOrder, enabled }
```
> ⚠️ Field is `bannerImage` (NOT `description`).

### ChatMessageDto (admin)
```typescript
{ id: number; roomId: number; userId: UUID; username: string; message: string; sentAt: OffsetDateTime }
```
> ⚠️ Field is `message` (NOT `content`).

### TimeSeriesDto
```typescript
{
  metric: string; granularity: string;
  points: Array<{ period: string; count: number; extra1: number; extra2: number }>
}
// extra1 depends on metric:
//   "purchases" → pezTotal | "logins" → uniqueUsers | "kreds" → revenueCents
// extra2: "purchases" → kredsTotal
```
> ⚠️ Fields are `period` + `count` (NOT `timestamp` + `value`).

### TopItemDto
```typescript
{ itemId: number; name: string; displayImage: string; purchaseCount: number }
```
> ⚠️ Fields are `name` + `purchaseCount` (NOT `itemName` + `salesCount`).

### TopUserDto
```typescript
{ userId: UUID; username: string; purchaseCount: number; totalPez: number; totalKreds: number }
```
> ⚠️ Field is `totalPez` (NOT `totalSpent`).

### KredsPackageDto
```typescript
{ id: number; name: string; kredsAmount: number; priceCents: number; currency: string; active: boolean; createdAt: OffsetDateTime }
```

### DashboardDto
```typescript
{
  totalUsers: number; onlineNow: number; bannedUsers: number;
  newUsersToday: number; newUsersThisMonth: number;
  dauToday: number; mauThisMonth: number;
  totalRooms: number; lockedRooms: number;
  purchasesToday: number; pezSpentToday: number; kredsSpentOnItemsToday: number;
  kredsPurchasesToday: number; revenueTodayCents: number;
  deditoonPurchasesToday: number;
}
```

### RoomState (WebSocket → client on join)
```typescript
{
  roomId: string; name: string; houseData: string;  // JSON layout
  furnitures: FurnitureState[];
  users: RoomUser[];
  yourPermission: RoomPermission;  // 0|1|2
}
```

### HouseLayout (JSON parsed from houseData)
```typescript
{
  points: Array<{ x: number; y: number }>;   // YPOS/XPOS equivalent
  walls:  Array<{ ptA, ptB, h, enter?, door?, hidden? }>;
  floors: Array<{ points: number[] }>;        // indices into points array
}
```

---

## 7. Database Schema (Flyway V1–V14)

```
users              → id(UUID), username, password_hash, gender, email, rank, tooniz_level,
                     kreds, pez, created_at, last_login_at, online, current_room_id,
                     avatar_options(JSONB), banned, ban_reason, banned_at, banned_by_id
rooms              → id(BIGSERIAL), name, house_data(TEXT), max_users, user_count,
                     type, access, owner_id(FK users), password_hash, schema_id(FK), locked
house_schemas      → id, name, description
chat_messages      → id, room_id, user_id, username, message, sent_at
connection_logs    → id, user_id, connected_at
items              → id, name, item_type, sub_type, possessable, display_image,
                     sprite_path, sprite_key, created_at
user_items         → id, user_id, item_id, equipped, placed_in_room_id, acquired_at
shop_items         → id, shop_id, item_id, pez_price, kred_bonus, kred_price,
                     available, stock, collection_id, created_at
item_collections   → id, shop_id, name, banner_image, sort_order, enabled, created_at
purchase_logs      → id, user_id, shop_item_id, buy_option, final_price, created_at
kreds_packages     → id, name, kreds_amount, price_cents, currency, active, created_at
kreds_purchases    → id, user_id, package_id, price_cents, currency, created_at
deditoons          → id, author_id, message, created_at
deditoon_purchase_logs → id, user_id, deditoon_id, amount_pez, created_at
```

---

## 8. Architecture Diagrams

### Service communication
```
Browser (game-web :4200)
  │  HTTP /api/*  ──────────────────► game-api (:8080)  ──► PostgreSQL (:5432)
  │  WS  /ws/*   ──────────────────► game-server-java (:8081) ──┘
  │  GET assets  ──────────────────► game-assets (:3001 nginx)
  │
Browser (game-admin :4201)
  │  HTTP /api/*  ──────────────────► game-api (:8080)
```

### Frontend layers (game-web)
```
GameComponent (Angular)
  └─ GameCanvasComponent
       ├─ Application (PixiJS)
       ├─ GameCore (game-core library)
       │    ├─ HouseView (room layout)
       │    ├─ Avatar[] (players)
       │    └─ FurnitureController
       └─ SocketService (wraps @toon-live/game-socket)
            └─ GameSocket (wraps @stomp/stompjs)
                   └─ STOMP/WS → game-server-java
```

### game-server-java in-memory state (ConcurrentHashMap)
```
rooms:        roomId → Map<userId, ConnectedUser>
sessionIndex: sessionId → { roomId, userId }         (for disconnect cleanup)
userSessionIndex: userId → sessionId                 (duplicate session protection)
```
Presence (`online`, `current_room_id`, `user_count`) is persisted to PostgreSQL.
On startup, `@PostConstruct` resets all presence data to handle crash recovery.

---

## 9. Coding Guidelines (inferred from codebase)

### Java / Spring Boot (game-api, game-server-java)
- **Lombok everywhere**: `@Data`, `@Builder`, `@RequiredArgsConstructor`, `@Getter/@Setter`
- **Records for requests**: `AdminItemRequest`, `RankUpdateRequest` etc. are Java `record` types
- **Method-level security**: `@PreAuthorize("hasRole('ROLE_ADMIN')")` on controller methods
- **Authorization hierarchy**: `hasAnyRole('ROLE_MODERATOR','ROLE_ADMIN')` on class, `hasRole('ROLE_ADMIN')` overrides on method
- **DTOs are immutable responses**: use `@Data @Builder`; requests use records or `@Data`
- **No `@Transactional` on controllers**: transactions in service layer only
- **`FetchType.LAZY`** on all `@ManyToOne` / `@OneToMany`
- **`OffsetDateTime`** for all timestamps (Jackson configured to not write as timestamps)
- **Custom `JwtPrincipal`** injected via `@AuthenticationPrincipal` — has `getUserId(): UUID`
- **`@Builder.Default`** required on all fields with default values in Lombok builders
- **Error format**: `{ status: int, error: string }` JSON — set in SecurityConfig + GlobalExceptionHandler

### TypeScript / Angular (game-web, game-admin, game-socket, game-types)
- **Standalone components**: ALL components are `standalone: true`, NO NgModules
- **`inject()` function**: preferred over constructor injection
- **Angular Signals**: `signal()`, `computed()`, `signal.asReadonly()` — NOT BehaviorSubject for state
- **RxJS Subjects** only for event streams (`Subject<T>`, not for state)
- **Lazy routes**: ALL feature routes use `loadComponent: () => import(...)...`
- **Guard functions** (`authGuard`, `adminGuard`): functional guards (not class-based)
- **Token storage**: `localStorage` with keys `toon_token` / `toon_user`
- **JWT client-side validation**: decode `exp` claim client-side (no signature check — for UX only)
- **Environment files**: `environment.ts` / `environment.production.ts` with `apiUrl`, `wsUrl`
- **No barrel re-exports** in features — import directly from component file
- **game-types package**: imported as `@toon-live/game-types` (workspace alias)

### game-core (PixiJS engine)
- **Singleton managers**: `GameItemManager.getInstance()`, `FurnitureBaseManager.getInstance()`
- **Event-driven updates**: avatar/furniture state updated via methods called from SocketService
- **Isometric coordinate system**: `XPOS`/`YPOS` in house XML = inverted (YPOS → x, XPOS → y)
- **`AssetBaseUrl`**: centralized asset URL resolver (configured by `GameCore` constructor)
- **Container hierarchy**: `Application.stage → HouseView → [AreaView, WallView, Avatar, FurnitureView]`

---

## 10. Security Constraints

1. **JWT secret**: min 32 bytes, provided via `JWT_SECRET` env var — never hardcoded in prod
2. **CORS**: configured via `CORS_ORIGINS` env var; admin panel (`:4201`) is always allowed
3. **Password**: BCrypt, min 6 chars at registration
4. **Path traversal**: game-assets upload server normalizes & validates paths (no `..`)
5. **Upload MIME whitelist**: `image/*`, `application/json`, `video/webm`, `font/ttf`
6. **`ddl-auto: validate`**: Flyway owns schema, Hibernate never auto-modifies
7. **Duplicate session protection**: game-server-java evicts old session when same user reconnects
8. **`BannedException`**: banned users receive HTTP 403 with specific message at login/register

---

## 11. Environment Variables

| Variable | Used by | Description |
|---|---|---|
| `JWT_SECRET` | game-api, game-server-java, game-assets | HS256 signing key (min 32 chars) |
| `DB_URL` | game-api, game-server-java | JDBC URL |
| `DB_USER` | game-api, game-server-java | PostgreSQL user |
| `DB_PASSWORD` | game-api, game-server-java | PostgreSQL password |
| `DB_NAME` | docker-compose | Database name (default: `toonlive`) |
| `CORS_ORIGINS` | game-api | Comma-separated allowed origins (default: `http://localhost:4200`) |
| `PUBLIC_DIR` | game-assets | Public assets directory (default: `../public`) |
| `UPLOAD_PORT` | game-assets | Bun upload server port (default: `3002`) |

---

## 12. Development Commands

```bash
# Start everything in tmux (5 windows: db, api, server, web, admin)
./dev.sh
./dev.sh --kill    # stop all

# Individual services
make dev-api      # Spring Boot game-api with hot reload (bootRun + classes -t)
make watch-api    # gradle classes -t (recompile trigger for DevTools)
make dev-server   # Spring Boot game-server-java
make dev-web      # Angular game-web (Bun, port 4200)
make dev-admin    # Angular game-admin (npm, port 4201)

# Production Docker
make prod-build   # docker compose build
make prod         # docker compose up -d
make prod-stop    # docker compose down
make logs         # docker compose logs -f

# Dev Docker (PostgreSQL + Adminer only)
make dev-db       # docker compose -f docker-compose.dev.yml up -d
make dev-stop

# Type checking (all TS packages)
bun run typecheck

# game-api compile check
cd game-api && ./gradlew compileJava
```

---

## 13. Key Patterns & Examples

### Adding a new REST endpoint (game-api)
```java
// 1. Service method
@Transactional
public MyDto doSomething(UUID userId) { ... }

// 2. Controller
@GetMapping("/{id}")
@PreAuthorize("hasRole('ROLE_ADMIN')")
public ResponseEntity<MyDto> endpoint(@PathVariable UUID id) {
    return ResponseEntity.ok(service.doSomething(id));
}

// 3. DTO record (for requests)
public record MyRequest(String field1, int field2) {}
// Or @Data @Builder class (for responses)
```

### Angular service pattern (game-web, game-admin)
```typescript
@Injectable({ providedIn: 'root' })
export class MyService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl + '/api/my-resource';

  list(page = 0): Observable<Page<MyModel>> {
    return this.http.get<Page<MyModel>>(`${this.base}?page=${page}`);
  }
}
```

### Angular component pattern (game-admin)
```typescript
@Component({
  selector: 'app-my',
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule, ...],
  templateUrl: './my.component.html',
})
export class MyComponent {
  private service = inject(MyService);

  items = signal<MyModel[]>([]);
  loading = signal(false);

  ngOnInit() {
    this.loading.set(true);
    this.service.list().subscribe({
      next: page => { this.items.set(page.content); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
```

### GameSocket event handling (game-web)
```typescript
// In SocketService.connect():
this.gs.on('userJoined', (p) => this.userJoined$.next(p));
this.gs.on('remoteChatMessage', (p) => this.chatMessage$.next(p));

// Sending:
this.gs.sendAvatarMove(roomId, x, y, direction);
this.gs.sendChat(roomId, text);
```

### Furniture placement flow
```
Client: gs.sendFurniturePlace(roomId, { baseId, x, y, orientation })
Server: RoomStompController.placeFurniture()
      → RoomStateService.placeFurniture() → FurnitureState stored in memory
      → broadcast RemoteFurniturePlaceEvent to /topic/room/{roomId}/furniture-place
Client: SocketService.furniturePlace$.next(p)
      → GameCanvasComponent → gc.placeFurniture(p)
```

### Flyway migration naming
```
V{n}__{description}.sql
V1__init.sql, V2__houses.sql, ... V14__kreds_package_name.sql
```

---

## 14. Known Field Name Pitfalls

These field names have non-obvious names — always use exactly what the backend emits:

| Context | Wrong (don't use) | Correct |
|---|---|---|
| `AdminUserDto` | `kredsBalance` | `kreds` |
| `AdminUserDto` | `lastLogin` | `lastLoginAt` |
| `AdminRoomDto` | `currentUsers` | `userCount` |
| `AdminRoomDto.owner` | flat `ownerId`/`ownerUsername` | nested `owner: AdminUserDto` |
| `ItemDto` | `type` | `itemType` |
| `ItemDto` | `rarity` | `subType` |
| `ItemDto` | `assetPath` | `spritePath` + `spriteKey` |
| `ShopItemDto` | `item.name` (flat) | `item.item.name` (nested) |
| `ShopItemDto` | `available` | not in DTO response (admin request only) |
| `CollectionDto` | `description` | `bannerImage` |
| `ChatMessageDto` | `content` | `message` |
| `TimeSeriesDto.Point` | `timestamp` | `period` |
| `TimeSeriesDto.Point` | `value` | `count` |
| `TopItemDto` | `itemName` | `name` |
| `TopItemDto` | `salesCount` | `purchaseCount` |
| `TopUserDto` | `totalSpent` | `totalPez` |
| admin ban call | `ban(id, string)` | `ban(id, { reason: string })` |
| admin rank call | `updateRank(id, number)` | `updateRank(id, { rank: number })` |
| admin room kick | `kick()` | `kickAll()` (returns void) |

---

## 15. Docker Services Summary

| Service | Image | Port | Network |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | toonlive |
| `game-api` | `./game-api` (multi-stage) | 8080 | toonlive |
| `game-server` | `./game-server-java` (multi-stage) | 8081 | toonlive |
| `game-assets` | `./game-assets` (nginx + bun) | 3001 | toonlive |
| `game-admin` | `./game-admin` (node build → nginx) | 4201 | toonlive |

Dev docker (`docker-compose.dev.yml`): PostgreSQL + Adminer (:8888) only.
