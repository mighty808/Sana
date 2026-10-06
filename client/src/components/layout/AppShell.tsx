import { useLocation, useNavigate, useOutlet, NavLink } from 'react-router-dom'
import { LogOut, User as UserIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/features/auth/useAuth'
import { NAV_GROUPS } from './navItems'
import { ROLE_LABELS } from '@/lib/roles'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useRealtimeNotifications, useNotifications } from '@/features/notifications/api'
import { useRealtimeWardBoard } from '@/features/encounters/api'
import { useDashboard } from '@/features/dashboard/api'
import type { DashboardSummary } from '@/types/dashboard'
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

// Every notify() type that's about a Referral (see referral.service.ts's
// createReferral/updateReferralStatus and sendReferralMessage) — used to
// compute the Referrals nav item's own unread badge, the same way the
// Notifications item's badge is just "every unread notification."
const REFERRAL_NOTIFICATION_TYPES = ['referral.created', 'referral.message.created', 'referral.status.updated']

// Maps a nav item's route to whichever GET /analytics/dashboard field
// represents "something pending/needs your attention" for it — reusing
// the exact counts the Dashboard page itself already shows, rather than a
// second query computing the same thing a different way. `outstandingBalance`
// (money, not a count) is the one field deliberately left out everywhere —
// every other role's own dashboard field gets a badge here as long as a
// matching nav item exists for it.
// Keyed by role first since the same route means a different field
// depending on who's looking (e.g. '/lab-orders' is `pendingOrders` for a
// Lab Tech but `labOrdersAwaitingReview` for a Doctor) — `summary.role`
// narrows the union for free, so each branch only sees the fields that
// role's response actually has.
function getDashboardBadge(to: string, summary: DashboardSummary | undefined): number {
  if (!summary) return 0
  switch (summary.role) {
    case 'ADMIN':
      if (to === '/lab-orders') return summary.pendingLabOrders
      if (to === '/ward-board') return summary.criticalPatients
      if (to === '/appointments') return summary.appointmentsToday
      if (to === '/invoices') return summary.pendingInvoices
      if (to === '/prescriptions') return summary.pendingPrescriptions
      return 0
    case 'DOCTOR':
      if (to === '/encounters') return summary.activeEncounters
      if (to === '/lab-orders') return summary.labOrdersAwaitingReview
      if (to === '/ward-board') return summary.criticalPatients
      if (to === '/appointments') return summary.appointmentsToday
      if (to === '/prescriptions') return summary.myPendingPrescriptions
      return 0
    case 'NURSE':
      // The actual "needs a nurse" queue — checked in, but no encounter
      // opened yet — and the "Start encounter" action lives on this same
      // Appointments page, so that's where the badge belongs too.
      if (to === '/appointments') return summary.vitalsPendingCount
      if (to === '/ward-board') return summary.criticalPatients
      return 0
    case 'PATIENT':
      if (to === '/appointments') return summary.upcomingAppointments
      if (to === '/prescriptions') return summary.pendingPrescriptions
      return 0
    case 'LAB_TECH':
      return to === '/lab-orders' ? summary.pendingOrders : 0
    case 'PHARMACIST':
      return to === '/prescriptions' ? summary.pendingPrescriptions : 0
    default:
      return 0
  }
}

// This is the shared frame every logged-in screen renders inside: a white
// sidebar with nav items grouped by role, a slim header bar showing the
// current page title and the user's account menu, and the actual page
// content. All the visual choices here (colors, corner rounding, the flat
// nav rows) are kept consistent across the app rather than varying screen
// to screen.
export function AppShell() {
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // The current page, captured as an element here instead of rendering
  // <Outlet /> inside the animated wrapper below. <Outlet /> reads the
  // router's *current* route when it renders, so the page that is fading out
  // was re-rendering as the NEW page, which then mounted a second time when
  // the entering wrapper appeared — every page was built twice per
  // navigation, and any state it held (an opened dialog, say) was lost on the
  // second build. An element captured per render keeps its own route, so the
  // exiting wrapper keeps showing the page it started with.
  const outlet = useOutlet()

  // This is set up once and stays active for as long as the user is logged
  // in. It listens for live notification events and keeps the bell icon's
  // data and badge up to date no matter which page is currently showing.
  // It has to run unconditionally, before the `if (!user) return null`
  // below, because React hooks can't be skipped by an early return.
  useRealtimeNotifications()
  // Same reasoning as useRealtimeNotifications above — runs unconditionally,
  // for the whole logged-in session, so the Ward Board (and any open
  // encounter detail page) stays live no matter which screen is showing.
  useRealtimeWardBoard()
  // This reads from the same cached data as the bell icon (using the exact
  // same query key), so the same unread count can also be shown on the
  // sidebar's "Notifications" nav item, not just on the header icon.
  const { data: notifications } = useNotifications()
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0
  // Same idea, narrowed to the referral-related notification types, so the
  // "Referrals" nav item can carry its own badge the same way "Notifications"
  // does — see the ITEMS.referrals comment in navItems.ts.
  const referralUnreadCount =
    notifications?.filter((n) => !n.readAt && REFERRAL_NOTIFICATION_TYPES.includes(n.type)).length ?? 0
  // Same "shared cache, called a second time" idea as useNotifications
  // above — DashboardPage.tsx already fetches this under the same query
  // key, so this doesn't cost an extra request, just reuses the data for
  // the sidebar badges below (see getDashboardBadge).
  const { data: dashboard } = useDashboard()

  if (!user) return null

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  // Only show the nav groups for this role, and within those, only the
  // items this role's permissions actually allow, so a visible nav link
  // never leads somewhere the user isn't allowed to go.
  const groups = NAV_GROUPS[user.role.name]
    .map((group) => ({ ...group, items: group.items.filter((item) => hasPermission(item.permission)) }))
    .filter((group) => group.items.length > 0)

  // The current page's title comes from whichever nav item's route matches
  // the current URL. If no nav item matches — for example on a detail page
  // like /encounters/:id, which isn't in the sidebar — it falls back to
  // "Sana" so the header is never blank.
  const currentItem = groups.flatMap((g) => g.items).find((item) => location.pathname.startsWith(item.to))
  const pageTitle = currentItem?.label ?? 'Sana'

  return (
    <SidebarProvider>
      {/* ---------- Sidebar: white background, border only on the right
           side, nav items grouped under uppercase section labels. ---------- */}
      <Sidebar collapsible="icon" className="border-sidebar-border">
        <SidebarHeader className="px-3 py-4">
          <div className="flex items-center px-1">
            {/* Icon-only mark shows when the sidebar is collapsed to its
                narrow icon rail; the full lockup (icon + wordmark, one
                image) shows once it's expanded — there's no room for the
                wide lockup in the collapsed rail. */}
            <img src="/logo-icon.png" alt="Sana" className="hidden size-6 shrink-0 group-data-[collapsible=icon]:block" />
            <img src="/logo-full.png" alt="Sana" className="h-7 w-auto group-data-[collapsible=icon]:hidden" />
          </div>
        </SidebarHeader>

        <SidebarContent>
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                {group.label}
              </SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
                  // The badge count is state specific to this session, not
                  // something that belongs as a field on the shared NavItem
                  // shape every other item also uses, so it's looked up by
                  // matching the route instead. Notifications/Referrals use
                  // the live notifications query directly; everything else
                  // reuses the dashboard summary's own pending counts (see
                  // getDashboardBadge above).
                  const badgeCount =
                    item.to === '/notifications'
                      ? unreadCount
                      : item.to === '/referrals'
                        ? referralUnreadCount
                        : getDashboardBadge(item.to, dashboard)
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <NavLink to={item.to}>
                          <item.icon
                            className={isActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'}
                          />
                          <span>{item.label}</span>
                          {badgeCount > 0 && (
                            <span className="ml-auto flex size-4.5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white group-data-[collapsible=icon]:hidden">
                              {badgeCount > 9 ? '9+' : badgeCount}
                            </span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        {/* User info block at the bottom of the sidebar — avatar, name,
            role badge, and a direct logout button. This is separate from
            the header's own account dropdown, which handles the Profile
            link. */}
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
        {/* ---------- Header: 64px tall, white background, border only on
             the bottom, no shadow or background tint. ---------- */}
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

        {/* ---------- Content area: light gray background so white cards
             stand out clearly against it, a max width, no heavy shadows. ---------- */}
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
                {outlet}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
