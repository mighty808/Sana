import { useEffect, useState, type ComponentProps } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { usePatients } from '@/features/patients/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface PatientComboboxProps {
  value: string | undefined
  onChange: (patientId: string, label: string) => void
}

// A type-ahead patient picker used by the appointment booking form — plain
// shadcn Select doesn't work here since the patient list can run into the
// hundreds, so this searches server-side (reusing the same usePatients
// hook/debounce pattern as the Patients list page) instead of rendering
// every patient as an option.
//
// Accepts and forwards arbitrary extra props (...triggerProps) onto the
// trigger Button — shadcn's <FormControl> works by cloning `id`/
// `aria-describedby`/`aria-invalid` onto its single child via Radix Slot,
// which only reaches the real DOM node if this component passes those
// props through. Without this, the field's label/error never gets wired
// up to the actual interactive element, unlike every other field in the
// same form.
export function PatientCombobox({
  value,
  onChange,
  ...triggerProps
}: PatientComboboxProps & ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedLabel, setSelectedLabel] = useState('')

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(timeout)
  }, [search])

  const { data, isLoading } = usePatients({ search: debouncedSearch || undefined, page: 1, limit: 8 })

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
            {value ? selectedLabel : 'Search by name or patient number…'}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search patients…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {!isLoading && data?.patients.length === 0 && <CommandEmpty>No patients found.</CommandEmpty>}
            <CommandGroup>
              {data?.patients.map((patient) => {
                const label = `${patient.firstName} ${patient.lastName} · ${patient.patientNumber}`
                return (
                  <CommandItem
                    key={patient._id}
                    value={patient._id}
                    onSelect={() => {
                      onChange(patient._id, label)
                      setSelectedLabel(label)
                      setOpen(false)
                    }}
                  >
                    <Search className="size-4 text-slate-400" />
                    <span className="flex-1 truncate">{label}</span>
                    {value === patient._id && <Check className="size-4 text-blue-600" />}
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
