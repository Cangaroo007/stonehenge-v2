# Component Usage Guide - Linear-Inspired Design System

## Quick Reference for Updated Components

### Button Variants

```tsx
import { Button } from '@/components/ui/button';

// Default - Zinc dark button
<Button>Click me</Button>
<Button variant="default">Click me</Button>

// Primary - Amber action button (use for main CTAs)
<Button variant="primary">Save Changes</Button>

// Outline - Zinc border, white background
<Button variant="outline">Cancel</Button>

// Ghost - No border, subtle hover
<Button variant="ghost">Learn More</Button>

// Danger - Red for destructive actions
<Button variant="danger">Delete</Button>
```

### Input & Textarea

```tsx
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// Input with zinc borders
<Input type="text" placeholder="Enter text..." />

// Textarea with zinc borders
<Textarea placeholder="Enter description..." />
```

### Card Components

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Optional description text</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Main content */}
  </CardContent>
  <CardFooter>
    {/* Optional footer with actions */}
  </CardFooter>
</Card>
```

### Table Components

```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

<div className="overflow-x-auto">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Column 1</TableHead>
        <TableHead>Column 2</TableHead>
        <TableHead>Column 3</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Data 1</TableCell>
        <TableCell>Data 2</TableCell>
        <TableCell>Data 3</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>
```

### Label

```tsx
import { Label } from '@/components/ui/label';

<Label htmlFor="email">Email Address</Label>
<Input id="email" type="email" />
```

### Radio Group

```tsx
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

<RadioGroup value={value} onValueChange={setValue}>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option1" id="option1" />
    <Label htmlFor="option1">Option 1</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option2" id="option2" />
    <Label htmlFor="option2">Option 2</Label>
  </div>
</RadioGroup>
```

## Keyboard Shortcuts

### Command Menu (Cmd+K)

Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux) anywhere in the app to open the command palette:

- **Search**: Type to filter commands
- **Navigate**: Use arrow keys (↑↓) to move between options
- **Select**: Press Enter to execute selected command
- **Close**: Press Escape or Cmd+K again

Available commands:
- Navigate to any main section (Dashboard, Quotes, Materials, etc.)
- Quick actions (Create New Quote)
- Access Settings and Customer pages

## Color Palette

### Zinc (Neutral)
- `zinc-50`: Main background
- `zinc-100`: Subtle hover states
- `zinc-200`: Default borders
- `zinc-500`: Secondary text, placeholders
- `zinc-700`: Label text, table headers
- `zinc-900`: Primary text, focus rings

### Amber (Primary Action)
- `amber-600`: Primary button background
- `amber-700`: Primary button border/hover

### Semantic Colors
- `red-600/700`: Danger/destructive actions
- `white`: Button text on colored backgrounds, card surfaces

## Design Principles

### Information Density
The new components use tighter spacing for better data display:

```tsx
// OLD: Large padding
<div className="px-4 py-3">Content</div>

// NEW: Compact padding (table cells, list items)
<div className="px-3 py-2">Content</div>
```

### Focus States
All interactive elements have clear focus-visible states:

```tsx
// Focus ring: 1px zinc-900 ring with 2px offset
focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:ring-offset-2
```

### Border Radius
Consistent 8px radius for all components:

```tsx
// Use rounded-md everywhere (8px)
className="rounded-md"
```

### Flat but Layered
No heavy shadows, subtle borders create depth:

```tsx
// OLD: Heavy shadow
className="shadow-lg"

// NEW: Subtle border
className="border border-zinc-200"
```

## Migration Guide

### Button Migration

```tsx
// Before
<button className="bg-blue-600 text-white rounded-lg px-4 py-2">
  Save
</button>

// After
<Button variant="primary">Save</Button>
```

### Card Migration

```tsx
// Before
<div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
  <h3 className="text-2xl font-semibold">Title</h3>
  <div className="pt-4">Content</div>
</div>

// After
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

### Input Migration

```tsx
// Before
<input className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />

// After
<Input />  {/* Now uses zinc borders and zinc focus ring by default */}
```

## Utility Classes

The following utility classes are available in `globals.css`:

```css
.btn              /* Base button styles */
.btn-primary      /* Amber primary button */
.btn-secondary    /* Outline button */
.btn-danger       /* Red danger button */
.input            /* Input field styles */
.input-error      /* Error state input */
.label            /* Label styles */
.card             /* Card container */
.table-header     /* Table header cell */
.table-cell       /* Table body cell */
```

## Best Practices

1. **Use `variant="primary"` sparingly** - Only for the main CTA on a page
2. **Prefer `outline` or `ghost` for secondary actions**
3. **Use Table components instead of raw `<table>` tags** for consistency
4. **Always pair Label with Input/Textarea** for accessibility
5. **Use CardDescription for additional context** in card headers
6. **Test keyboard navigation** - Tab through forms, use Cmd+K command menu
7. **Maintain 8px spacing** - Use py-2, px-3, gap-2, space-y-2, etc.

## Examples in the Codebase

Look for these patterns in existing pages:
- Quote builder forms: `/quotes/[id]/builder`
- Settings pages: `/settings/*`
- Dashboard: `/dashboard`
- Customer management: `/customers/*`
