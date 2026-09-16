import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'users',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/users/users-list/users-list.component').then(m => m.UsersListComponent),
  },
  {
    path: 'users/banned',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/users/banned-users/banned-users.component').then(m => m.BannedUsersComponent),
  },
  {
    path: 'users/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/users/user-detail/user-detail.component').then(m => m.UserDetailComponent),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/chat/chat-logs.component').then(m => m.ChatLogsComponent),
  },
  {
    path: 'rooms',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/rooms/rooms.component').then(m => m.RoomsComponent),
  },
  {
    path: 'items',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/items/items.component').then(m => m.ItemsComponent),
  },
  {
    path: 'metiers',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/metiers/metiers.component').then(m => m.MetiersComponent),
  },
  {
    path: 'clothing-studio',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/clothing-studio/clothing-studio.component').then(m => m.ClothingStudioComponent),
  },
  {
    path: 'shops/:shopId',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/shops/shop-editor.component').then(m => m.ShopEditorComponent),
  },
  {
    path: 'kreds',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/kreds/kreds-packages.component').then(m => m.KredsPackagesComponent),
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
