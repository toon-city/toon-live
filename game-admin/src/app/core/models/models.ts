// ─── Authentification ─────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
  username: string;
  gender: string | null;
  rank: number;
  toonizLevel: number;
  kreds: number;
  pez: number;
}

export interface CurrentUser {
  userId: string;
  username: string;
  rank: number;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  gender: string | null;
  rank: number;
  toonizLevel: number;
  kreds: number;
  pez: number;
  online: boolean;
  banned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  bannedById: string | null;
  bannedByUsername: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface BanRequest {
  reason: string;
}

export interface RankUpdateRequest {
  rank: number;
}

/** Either field omitted/null leaves that currency untouched. */
export interface BalanceUpdateRequest {
  pez?: number | null;
  kreds?: number | null;
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

export interface AdminRoom {
  id: number;
  name: string;
  type: string;
  access: string;
  maxUsers: number;
  userCount: number;
  locked: boolean;
  owner: AdminUser | null;
  houseData: string | null;
  createdAt: string;
}

export interface AdminRoomUpdate {
  name?: string;
  access?: string;
  houseData?: string;
  ownerId?: string;
  maxUsers?: number;
}

// ─── Items ────────────────────────────────────────────────────────────────────

export interface ItemInfo {
  id: number;
  name: string;
  itemType: string;
  subType: string;
  possessable: boolean;
  displayImage: string | null;
  spritePath: string | null;
  spriteKey: string | null;
}

export interface AdminItemRequest {
  name: string;
  itemType: string;
  subType: string;
  possessable: boolean;
  displayImage: string;
  spritePath?: string;
  spriteKey?: string;
}

// ─── Métiers ────────────────────────────────────────────────────────────────

export interface MetierInfo {
  id: number;
  name: string;
  dailyPez: number;
  /** null = pas de condition sur ce critère. 0/1/2/3 = aucun/bronze/argent/or. */
  minToonizLevel: number | null;
  /** null = pas de condition sur ce critère. */
  minDaysPlayed: number | null;
  outfitTshirtItemId: number | null;
  outfitTshirtItemName: string | null;
  outfitPantItemId: number | null;
  outfitPantItemName: string | null;
  outfitHatItemId: number | null;
  outfitHatItemName: string | null;
}

export interface AdminMetierRequest {
  name: string;
  dailyPez: number;
  minToonizLevel: number | null;
  minDaysPlayed: number | null;
  outfitTshirtItemId: number | null;
  outfitPantItemId: number | null;
  outfitHatItemId: number | null;
}

// ─── Shop ─────────────────────────────────────────────────────────────────────

export interface ShopItem {
  id: number;
  item: ItemInfo;
  pezPrice: number | null;
  kredBonus: number;
  kredPrice: number | null;
  collectionId: number | null;
  stock: number | null;
}

export interface ShopItemRequest {
  itemId: number;
  pezPrice?: number;
  kredBonus?: number;
  kredPrice?: number;
  available?: boolean;
  stock?: number | null;
  collectionId?: number | null;
}

export interface CollectionInfo {
  id: number;
  shopId: string;
  name: string;
  bannerImage: string | null;
  sortOrder: number;
  enabled: boolean;
}

export interface CollectionRequest {
  name: string;
  bannerImage?: string;
  sortOrder?: number;
  enabled?: boolean;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  roomId: number;
  userId: string;
  username: string;
  message: string;
  sentAt: string;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalUsers: number;
  onlineNow: number;
  bannedUsers: number;
  totalRooms: number;
  lockedRooms: number;
  purchasesToday: number;
  pezSpentToday: number;
  kredsSpentOnItemsToday: number;
  kredsPurchasesToday: number;
  revenueTodayCents: number;
  dauToday: number;
  mauThisMonth: number;
}

export interface TimeSeriesPoint {
  period: string;
  count: number;
  extra1?: number;
  extra2?: number;
}

export interface TimeSeries {
  metric: string;
  granularity: string;
  points: TimeSeriesPoint[];
}

export interface TopItem {
  itemId: number;
  name: string;
  displayImage: string;
  purchaseCount: number;
}

export interface TopUser {
  userId: string;
  username: string;
  purchaseCount: number;
  totalPez: number;
}

// ─── Kreds ────────────────────────────────────────────────────────────────────

export interface KredsPackage {
  id: number;
  name: string;
  kredsAmount: number;
  priceCents: number;
  currency: string;
  active: boolean;
  createdAt: string;
}

export interface KredsPackageRequest {
  name: string;
  kredsAmount: number;
  priceCents: number;
  currency?: string;
  active?: boolean;
}
