# Design Guidelines: Betfair Exchange Italy Betting Automation Platform

## Design Approach
**System-Based Approach**: Material Design principles adapted for financial data applications, prioritizing clarity, efficiency, and trust. This is a professional utility tool requiring precision and reliability over visual flair.

## Core Design Principles
1. **Data Clarity First**: Financial and betting data must be instantly scannable
2. **Professional Trust**: Clean, credible interface for handling real money
3. **Efficient Workflows**: Minimize clicks for critical betting actions
4. **Real-time Responsiveness**: Live odds updates with clear visual feedback

## Typography
- **Primary Font**: Inter (via Google Fonts CDN)
- **Hierarchy**:
  - H1: 2.5rem, font-semibold (Dashboard titles)
  - H2: 1.875rem, font-semibold (Section headers)
  - H3: 1.5rem, font-medium (Card headers)
  - Body: 1rem, font-normal (Default text)
  - Small: 0.875rem, font-normal (Metadata, timestamps)
  - Data Display: 1.125rem, font-mono (Odds, stakes, P/L)
  - Financial Values: font-semibold for amounts

## Layout System
**Spacing Units**: Tailwind units of 2, 4, 6, 8, 12, 16, 24
- Component padding: p-4 to p-6
- Section spacing: mb-8 to mb-12
- Card gaps: gap-4 to gap-6
- Container: max-w-7xl mx-auto px-4

**Grid Structure**:
- Dashboard: 12-column grid on desktop, single column on mobile
- Sidebar navigation: 280px fixed width (desktop), slide-over on mobile
- Main content area: Flexible, max-width constrained

## Component Library

### Navigation
- **Top Bar**: Fixed header with logo, user info, notifications, logout
- **Sidebar**: Collapsible navigation (Dashboard, Markets, Dutching, History, Settings)
- **Breadcrumbs**: Clear navigation path for nested views

### Dashboard Components
- **Stats Cards**: Grid layout showing account balance, pending bets, today's P/L, active markets
- **Market Browser**: Searchable/filterable table with sport type, event name, market type, and quick actions
- **Live Odds Display**: Real-time updating table with QP (quote punto), QB (quote banco), offset calculations
- **Alert Banner**: System notifications, session warnings, error messages

### Dutching Interface
- **Score Selection Grid**: Checkbox grid for exact score selections (0-0, 1-0, 1-1, 2-0, etc.)
- **Calculation Panel**: Input for total stake/liability, auto-calculates individual stakes
- **Odds Summary Table**: Selected scores with current odds, calculated stakes, potential returns
- **Placement Controls**: Place Bet button (prominent), Clear Selection, Save Strategy

### Forms & Inputs
- **Login Form**: Clean centered card with Replit Auth integration
- **Input Fields**: Clear labels, validation states, helper text for limits
- **Dropdowns**: Sport/event/market type selectors with search
- **Number Inputs**: Steppers for stake amounts with min/max validation (€2.00 - €10,000)

### Data Tables
- **Bet History**: Sortable columns (date, market, type, stake, odds, status, P/L)
- **Market Data**: Real-time odds with visual indicators for changes (green up, red down)
- **Active Bets**: Expandable rows showing bet details and potential outcomes

### Feedback Elements
- **Loading States**: Skeleton screens for data fetching, spinners for actions
- **Toast Notifications**: Success/error messages for bet placement, API responses
- **Status Badges**: Pill-shaped badges for bet status (Pending, Matched, Won, Lost, Void)
- **Progress Indicators**: Linear progress for API operations

### Financial Displays
- **P/L Indicators**: Green for profit, red for loss, with +/- symbols
- **Balance Display**: Prominent, always visible in header
- **Stake Calculator**: Real-time calculation preview with breakdown

## Animations
**Minimal and Purposeful**:
- Smooth transitions for sidebar collapse/expand (200ms)
- Fade-in for loading content (150ms)
- Highlight flash for live odds updates (300ms pulse)
- No decorative animations

## Accessibility
- ARIA labels for all interactive elements
- Keyboard navigation for all workflows
- Focus indicators on all inputs and buttons
- High contrast for financial data (profit/loss)
- Screen reader announcements for bet placement success/failure
- Consistent tab order throughout forms

## Page Layouts

### Login Page
- Centered card on neutral background
- Replit Auth button prominent
- Security/privacy messaging
- Session management info

### Dashboard
- Sidebar navigation (left)
- Top stats bar (4-column grid on desktop, stacked mobile)
- Main content: Upcoming markets table, recent activity feed
- Quick actions floating action button (mobile)

### Market Browser
- Filter sidebar (sport, date, market type)
- Main area: Markets table with search, sort, pagination
- Click row to expand odds view
- "Dutch This Market" action button

### Dutching Interface
- Left panel: Score selection grid (responsive grid-cols-3 to grid-cols-5)
- Right panel: Calculation inputs and summary
- Bottom: Odds table with calculated stakes
- Fixed footer: Total stake, expected return, Place Bets button

### History Page
- Date range filter
- Summary cards (total bets, win rate, net P/L)
- Detailed table with expandable rows
- Export functionality

## Images
**No images required** - This is a data-focused application. Use icons exclusively:
- **Icon Library**: Heroicons (via CDN)
- Dashboard icons: ChartBarIcon, BanknotesIcon, ClockIcon
- Market icons: Football, Basketball, Tennis sport indicators  
- Action icons: PlusIcon, TrashIcon, CheckIcon, XMarkIcon
- Status icons: CheckCircleIcon (success), ExclamationTriangleIcon (warning)

## Responsive Behavior
- **Desktop (lg:)**: Full sidebar, multi-column layouts, expanded tables
- **Tablet (md:)**: Collapsible sidebar, 2-column grids, compact tables
- **Mobile (base)**: Slide-over navigation, single column, card-based layouts, sticky headers

## Security Visual Indicators
- Lock icon for authenticated sessions
- Session timeout countdown in header
- Secure connection badge
- API key masked display with reveal toggle