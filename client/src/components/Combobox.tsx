import { useState, type ComponentProps } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface ComboboxProps<T> {
  value: string | undefined
  onChange: (id: string, item: T) => void
  items: T[] | undefined
  getId: (item: T) => string
  getLabel: (item: T) => string
  // It's up to whichever screen uses this component to decide how search
  // works: either sending each keystroke to the server after a short delay
  // (for a large list) or filtering an already-loaded array right away (for
  // a small list). This component itself just displays whatever `items` it
  // is given for the current `search` text.
  search: string
  onSearchChange: (value: string) => void
  triggerPlaceholder: string
  inputPlaceholder: string
  emptyText: string
  // Prevents the "no results" message from showing while a search request
  // is still in progress. Without this, when `items` comes from a delayed
  // server search, the list would briefly look empty and flash "not found"
  // before the real results arrive.
  isLoading?: boolean
  // Shows a small icon next to each item. Used by pickers that search a
  // large remote collection (like patients) to make clear that typing will
  // search for more results. Not needed when `items` is already a small,
  // fully-loaded list.
  showItemIcon?: boolean
  // Overrides the label shown on the picker button. This is needed when
  // `items` is a filtered or partial list that might no longer contain the
  // currently selected record (for example, after the search text changes).
  // Without this, the label would go blank in that case because it couldn't
  // be found in `items` anymore. Leave this out when `items` always
  // contains the full list, since the selected record's label can always be
  // found there directly.
  selectedLabel?: string
}

// This is the shared search-as-you-type picker used by both PatientCombobox
// (which searches the server after a short delay) and InvoicesPage's
// LabOrderCombobox (which filters an already-loaded list on the client).
// The two only differ in how they produce `items` and `search` — the picker
// itself looks and behaves the same either way.
export function Combobox<T>({
  value,
  onChange,
  items,
  getId,
  getLabel,
  search,
  onSearchChange,
  triggerPlaceholder,
  inputPlaceholder,
  emptyText,
  isLoading = false,
  showItemIcon = false,
  selectedLabel,
  ...triggerProps
}: ComboboxProps<T> & Omit<ComponentProps<typeof Button>, 'onChange' | 'value'>) {
  const [open, setOpen] = useState(false)
  const selectedItem = items?.find((item) => getId(item) === value)
  const displayLabel = selectedLabel ?? (selectedItem ? getLabel(selectedItem) : undefined)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between font-normal"
          {...triggerProps}
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value && displayLabel ? displayLabel : triggerPlaceholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={inputPlaceholder} value={search} onValueChange={onSearchChange} />
          <CommandList>
            {!isLoading && (items?.length ?? 0) === 0 && <CommandEmpty>{emptyText}</CommandEmpty>}
            <CommandGroup>
              {items?.map((item) => {
                const id = getId(item)
                const label = getLabel(item)
                return (
                  <CommandItem
                    key={id}
                    value={id}
                    onSelect={() => {
                      onChange(id, item)
                      setOpen(false)
                    }}
                  >
                    {showItemIcon && <Search className="size-4 text-slate-600" />}
                    <span className="flex-1 truncate">{label}</span>
                    {value === id && <Check className="size-4 text-blue-600" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
