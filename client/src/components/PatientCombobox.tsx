import { useEffect, useState, type ComponentProps } from 'react'
import { usePatients } from '@/features/patients/api'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/Combobox'

interface PatientComboboxProps {
  value: string | undefined
  onChange: (patientId: string, label: string) => void
}

// A search-as-you-type patient picker used by the appointment booking form.
// A plain shadcn Select doesn't work here because the patient list can run
// into the hundreds, so this searches on the server instead (reusing the
// same usePatients hook and delay pattern as the Patients list page),
// through the shared Combobox (see @/components/Combobox), rather than
// listing every single patient as an option.
//
// This component accepts and passes along any extra props (...triggerProps)
// onto the trigger Button. shadcn's <FormControl> works by copying `id`,
// `aria-describedby`, and `aria-invalid` onto its one child element, and
// that copy only reaches the actual DOM element if this component forwards
// those props through. Without this, the field's label and error message
// wouldn't be connected to the real interactive element, unlike every other
// field in the same form.
export function PatientCombobox({
  value,
  onChange,
  ...triggerProps
}: PatientComboboxProps & ComponentProps<typeof Button>) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // The current page of search results may no longer include the
  // previously selected patient once the search text changes. This label is
  // stored separately (instead of being looked up from `data.patients`
  // alone) so the picker's button doesn't go blank in that case.
  const [selectedLabel, setSelectedLabel] = useState('')

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(timeout)
  }, [search])

  const { data, isLoading } = usePatients({ search: debouncedSearch || undefined, page: 1, limit: 8 })

  return (
    <Combobox
      value={value}
      onChange={(patientId, patient) => {
        const label = `${patient.firstName} ${patient.lastName} · ${patient.patientNumber}`
        setSelectedLabel(label)
        onChange(patientId, label)
      }}
      items={data?.patients}
      getId={(patient) => patient._id}
      getLabel={(patient) => `${patient.firstName} ${patient.lastName} · ${patient.patientNumber}`}
      isLoading={isLoading}
      search={search}
      onSearchChange={setSearch}
      triggerPlaceholder="Search by name or patient number…"
      inputPlaceholder="Search patients…"
      emptyText="No patients found."
      showItemIcon
      selectedLabel={value ? selectedLabel : undefined}
      {...triggerProps}
    />
  )
}
