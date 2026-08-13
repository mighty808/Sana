import { Outlet, useLocation, useNavigate, NavLink } from 'react-router-dom'
import { LogOut, User as UserIcon, Activity } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/features/auth/useAuth'
import { NAV_GROUPS } from './navItems'
import { ROLE_LABELS } from '@/lib/roles'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useRealtimeNotifications } from '@/features/notifications/api'
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}


// The shared shell every authenticated screen renders inside: a white,
// role-grouped sidebar (per the approved design spec — no dark sidebar),
// a slim header bar with the current page title and the user's account
// menu, and the routed page content. Every visual choice here (colors,
// radii, the flat px-3 py-2 nav rows) follows Sana_Frontend_Design_Prompt.md
// literally rather than improvising — that spec is the single source of
// truth for this app's visual language now.
export function AppShell() {
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Mounted once, for the lifetime of the authenticated shell — listens for
  // live notification.created events and keeps the bell's cache/badge in
  // sync regardless of which page is currently showing. Must run
  // unconditionally (before the `if (!user) return null` below) since React
  // hooks can't follow a conditional early return.
  useRealtimeNotifications()

  if (!user) return null

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  // Only this role's groups, and only the items this role's permissions
  // actually allow — a visible nav link is never a dead end.
  const groups = NAV_GROUPS[user.role.name]
    .map((group) => ({ ...group, items: group.items.filter((item) => hasPermission(item.permission)) }))
    .filter((group) => group.items.length > 0)

  // The current page's title, derived from whichever nav item's route
  // matches the current location — falls back to "Sana" so the header
  // never renders blank for a route not represented in the sidebar (e.g. a
  // detail page like /encounters/:id).
  const currentItem = groups.flatMap((g) => g.items).find((item) => location.pathname.startsWith(item.to))
  const pageTitle = currentItem?.label ?? 'Sana'

  return (
    <SidebarProvider>
      {/* ---------- Sidebar: white background, right border only, grouped
           nav with uppercase section labels — per spec, never dark. ---------- */}
      <Sidebar collapsible="icon" className="border-sidebar-border">
        <SidebarHeader className="px-3 py-4">
          <div className="flex items-center gap-2 px-1">
            <Activity className="size-6 shrink-0 text-primary" />
            <span className="text-xl font-bold tracking-tight text-primary group-data-[collapsible=icon]:hidden">
              Sana
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {group.label}
              </SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <NavLink to={item.to}>
                          <item.icon
                            className={isActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'}
                          />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        {/* User identity block at the foot of the sidebar — avatar,
            name, role badge, and a direct logout action, exactly as the
            spec's sidebar section describes (separate from the header's
            own account dropdown, which covers Profile). */}
        <SidebarFooter className="gap-3 border-t border-sidebar-border px-3 py-3">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-blue-100 text-xs font-semibold text-blue-700">
                {initials(user.firstName, user.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {user.firstName} {user.lastName}
              </p>
              <Badge variant="outline" className="mt-0.5 border-blue-200 bg-blue-50 px-2 py-0 text-[10px] text-blue-600">
                {ROLE_LABELS[user.role.name] ?? user.role.name}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Log out"
              onClick={handleLogout}
              className="shrink-0 text-muted-foreground hover:text-destructive group-data-[collapsible=icon]:hidden"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        {/* ---------- Header: 64px, white, bottom border only — no shadow,
             no background tint, per spec. ---------- */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold text-foreground">{pageTitle}</h1>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-blue-100 text-xs font-semibold text-blue-700">
                      {initials(user.firstName, user.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium text-foreground sm:inline">
                    {user.firstName} {user.lastName}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {user.firstName} {user.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <UserIcon className="size-4" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} variant="destructive">
                  <LogOut className="size-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* ---------- Content area: slate-50 background so white cards get
             visible definition against it, max-w-7xl, no heavy shadows. ---------- */}
        <main className="flex-1 overflow-auto bg-background p-6">
          <div className="mx-auto max-w-7xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
