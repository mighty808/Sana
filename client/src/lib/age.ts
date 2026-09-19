// Turns a date-of-birth string into a whole-years age. It checks whether
// this year's birthday has already happened yet, rather than just
// subtracting the birth year from the current year.
export function calculateAge(dob: string): number {
  const birth = new Date(dob)
  const now = new Date()
  // dob comes back from the API as a UTC midnight instant representing a
  // calendar date (e.g. "1958-05-17T00:00:00.000Z"), not a specific moment
  // in the clinician's local time. Reading it back with getMonth()/getDate()
  // converts that instant to the browser's local timezone first, which can
  // shift it to the previous day west of UTC — making the age look a year
  // too high for part of that day. Reading it with the UTC getters instead
  // keeps the birth date exactly as it was recorded. `now` is read with the
  // UTC getters too, so both sides of the birthday comparison below are in
  // the same calendar frame — mixing local getters for one side and UTC for
  // the other would compare two different "today"s near a birthday boundary.
  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate())
  if (!hasHadBirthdayThisYear) age -= 1
  return age
}
