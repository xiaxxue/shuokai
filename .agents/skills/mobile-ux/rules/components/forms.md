# Forms

入力フォームのルール。フォームはAIが最も高頻度に品質を落とす領域であり、ラベル・検証タイミング・エラー回復の3点が中心。
エラー文言の書き方は `rules/content/ux-writing.md`（WRITE-002）、日本語固有の表記は `rules/content/japanese-ux-writing.md` が正本。

```yaml
id: FORM-001
title: Every input has a persistent visible label
area: components
subcategory: labels
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Every input control MUST have a visible label that remains visible while the
  user types; placeholder text MUST NOT be used as the only label.
rationale: >-
  Placeholders disappear on input, so users lose the ability to verify what each
  field is for when reviewing or correcting a form, and their low contrast makes
  them unreadable for many users to begin with.
values:
  wcag: 3.3.2 Labels or Instructions (A); 1.3.1 Info and Relationships (A) — the label must be programmatically associated with the field
  android: every text field should have a label that is always visible, short, and never truncated
applies_to:
  - text fields and text areas
  - selects, date pickers, and comboboxes
  - checkbox and radio groups
  - search fields
exceptions:
  - A search field whose purpose is unambiguous from a leading search icon and
    its position, provided an accessible name is still set.
good_examples:
  - "A label above the field, with format guidance in separate support text."
bad_examples:
  - "A field showing only the placeholder 'メールアドレス', which vanishes once typing starts."
review_check: >-
  Does every input keep a visible label while text is being entered, with any
  format hint in separate support text rather than in the placeholder?
related: [FORM-002, A11Y-001, JA-004]
sources:
  - title: WCAG 2.2 — 3.3.2 Labels or Instructions
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: Material Design 3 — Text fields guidelines
    url: https://m3.material.io/components/text-fields/guidelines
    tier: A
  - title: NN/g — Website Forms Usability
    url: https://www.nngroup.com/articles/web-form-design/
    tier: B
  - title: USWDS — Text input
    url: https://designsystem.digital.gov/components/text-input/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: FORM-002
title: State required and optional status before submission
area: components
subcategory: labels
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  Whether each field is required or optional MUST be visible before the user
  submits, using a marker plus an explanation rather than a marker alone.
rationale: >-
  If required status only appears as a post-submit error, users fill the form
  twice; a bare asterisk with no legend is meaningless to first-time and
  screen-reader users.
values:
  android: mark required fields with an asterisk plus an explanation in support text or a note at the start of the form
  ja: DADS marks required/optional with a full-width "※" prefix (※必須 / ※任意)
applies_to:
  - all multi-field forms
exceptions:
  - Single-field forms, where the requirement is self-evident.
good_examples:
  - "'※必須' shown next to each required label, with all-optional fields labeled '※任意'."
bad_examples:
  - "A red asterisk with no legend anywhere on the screen."
review_check: >-
  Can the user tell which fields are required before tapping submit, with the
  meaning of the marker explained on the screen?
related: [FORM-001, JA-001, COLOR-003]
sources:
  - title: Material Design 3 — Text fields guidelines
    url: https://m3.material.io/components/text-fields/guidelines
    tier: A
  - title: USWDS — Form component guidance
    url: https://designsystem.digital.gov/components/form/
    tier: B
  - title: デジタル庁デザインシステム — インプットテキスト
    url: https://design.digital.go.jp/dads/components/input-text/usage/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: FORM-003
title: Ask for the fewest fields the task requires
area: components
subcategory: structure
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Forms SHOULD collect only data required to complete the current task; data that
  can be derived, defaulted, or collected later SHOULD be removed from the form,
  and optional fields SHOULD be kept to a minimum and labeled as optional.
rationale: >-
  Every additional field lowers completion rates, and on mobile the cost of each
  field is higher because of typing effort and limited screen space.
values:
  nng: minimize optional fields (roughly 1–2 maximum) and label them clearly
applies_to:
  - sign-up and onboarding forms
  - creation and edit forms
  - checkout flows
exceptions:
  - Legally mandated data collection.
good_examples:
  - "A book-logging form asking only for title, with author and rating optional and editable later."
bad_examples:
  - "A sign-up form requesting birth date, gender, and phone number for an app that uses none of them."
review_check: >-
  For each field in this form, is the data required to complete the current task
  rather than derivable, defaultable, or deferrable?
related: [FOUND-005, FORM-008]
sources:
  - title: NN/g — Website Forms Usability
    url: https://www.nngroup.com/articles/web-form-design/
    tier: B
  - title: GOV.UK Design System — Question pages
    url: https://design-system.service.gov.uk/patterns/question-pages/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: FORM-004
title: Match the input control and keyboard to the data
area: components
subcategory: input-methods
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  Each field MUST present the keyboard type appropriate to its content, and a
  constrained set of known options SHOULD use a selection control rather than
  free text.
rationale: >-
  A wrong keyboard forces mode switching on every entry and produces avoidable
  format errors; free text where options are known guarantees invalid values.
values:
  nng: use radio buttons instead of a dropdown for 2–3 options; size fields to the expected input length
applies_to:
  - email, phone, numeric, URL, and password fields
  - date and time entry
  - fields with enumerable values
exceptions:
  - Fields whose accepted values are genuinely open-ended.
good_examples:
  - "A numeric keypad for an amount field and a date picker for a date."
bad_examples:
  - "A default text keyboard for an email field."
  - "A free-text field for a status that has three valid values."
review_check: >-
  Does each field open the keyboard type matching its content, and does every
  field with a known finite option set use a selection control?
related: [FORM-003, FOUND-003, A11Y-002]
sources:
  - title: Apple HIG — Text fields
    url: https://developer.apple.com/design/human-interface-guidelines/text-fields
    tier: A
    note: Show the keyboard type appropriate to the content; use a secure field for sensitive data.
  - title: NN/g — Website Forms Usability
    url: https://www.nngroup.com/articles/web-form-design/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: FORM-005
title: Validate at the right moment and identify the field in error
area: components
subcategory: validation
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Validation errors MUST NOT be shown while the user is still typing a first
  entry; errors MUST be reported in text next to the field they belong to, and
  MUST identify which field is wrong.
rationale: >-
  Errors shown mid-typing tell users they are wrong before they have finished
  being right, and errors shown far from the field leave users guessing which
  input to fix.
values:
  wcag: 3.3.1 Error Identification (A) — the item in error must be identified and described in text
  ios: validate an email address when focus leaves the field; validate new usernames and passwords before focus leaves
applies_to:
  - all validated inputs
  - multi-step forms
exceptions:
  - Error-prone interactions where users are unlikely to be correct on the first
    attempt (e.g. password creation rules), which may validate in real time.
good_examples:
  - "An email field validated on blur, with the message rendered directly below it."
bad_examples:
  - "An error appearing after the first typed character of an email address."
  - "A single banner saying '入力エラーがあります' with no indication of which field."
review_check: >-
  Is each validation error shown after the user finishes the field (not during
  first entry), placed adjacent to that field, and identified in text?
related: [FORM-006, WRITE-002, STATE-005, JA-002]
sources:
  - title: WCAG 2.2 — 3.3.1 Error Identification
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: NN/g — Error-Message Guidelines
    url: https://www.nngroup.com/articles/error-message-guidelines/
    tier: B
  - title: Apple HIG — Text fields (validation timing)
    url: https://developer.apple.com/design/human-interface-guidelines/text-fields
    tier: A
  - title: GOV.UK Design System — Error message
    url: https://design-system.service.gov.uk/components/error-message/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: FORM-006
title: Never discard what the user entered
area: components
subcategory: recovery
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Form fields MUST retain both valid and invalid entries after a failed
  submission, and MUST NOT be cleared on error, navigation within the flow, or
  transient failure.
rationale: >-
  Clearing input turns a small correction into a full restart, and on mobile
  re-typing is expensive enough that users abandon the task.
values:
  wcag: 3.3.7 Redundant Entry (A) — previously entered information must be auto-populated or available for selection
applies_to:
  - failed submissions
  - multi-step forms
  - navigation away and back
  - session or connectivity interruptions
exceptions:
  - Security-sensitive fields such as passwords and one-time codes, where
    re-entry is required by design.
good_examples:
  - "A failed checkout returning to the form with every field still filled and only the invalid one flagged."
bad_examples:
  - "A registration form wiped clean because the password did not meet the rules."
review_check: >-
  After a failed submission or a step back, does every non-sensitive field still
  contain what the user typed?
related: [FORM-005, NAV-010, FOUND-004]
sources:
  - title: GOV.UK Design System — Error message
    url: https://design-system.service.gov.uk/components/error-message/
    tier: B
    note: Never clear form fields on error.
  - title: WCAG 2.2 — 3.3.7 Redundant Entry
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: NN/g — Error-Message Guidelines
    url: https://www.nngroup.com/articles/error-message-guidelines/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: FORM-007
title: Errors are conveyed in text, not only visually
area: components
subcategory: validation
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Every field error MUST include a text message describing the problem; a red
  border, colored label, or icon alone MUST NOT be the only indication of an error.
rationale: >-
  Users who cannot perceive the color and users of assistive technology receive
  no information at all from a purely visual error state.
values:
  wcag: 3.3.1 Error Identification (A); 3.3.3 Error Suggestion (AA) — provide a correction suggestion when it is known
applies_to:
  - inline field errors
  - form-level error summaries
exceptions:
  - Cases where describing the error would compromise security (e.g. revealing
    which half of a credential was wrong).
good_examples:
  - "A red border plus an icon plus the text '郵便番号は7桁の数字で入力してください'."
bad_examples:
  - "A field whose only error indication is that its outline turned red."
review_check: >-
  Does every error state include text describing what is wrong, in addition to
  any color or icon treatment?
related: [COLOR-003, WRITE-002, FORM-005]
sources:
  - title: WCAG 2.2 — 3.3.1 Error Identification / 3.3.3 Error Suggestion
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: NN/g — Error-Message Guidelines
    url: https://www.nngroup.com/articles/error-message-guidelines/
    tier: B
  - title: GOV.UK Design System — Error message
    url: https://design-system.service.gov.uk/components/error-message/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: FORM-008
title: Support autofill and avoid asking twice for the same data
area: components
subcategory: efficiency
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  Fields collecting known user data MUST declare their purpose so the platform
  can autofill them, and information already provided earlier in a flow MUST be
  reused or offered for selection rather than re-typed.
rationale: >-
  Manual re-entry on a phone keyboard is slow and error-prone, and re-asking for
  data the app already holds signals that the app is not paying attention.
values:
  wcag: 1.3.5 Identify Input Purpose (AA); 3.3.7 Redundant Entry (A)
applies_to:
  - name, email, address, phone, postal code fields
  - credentials and one-time codes
  - multi-step checkout and application flows
exceptions:
  - Deliberate confirmation entries required for security or accuracy
    (e.g. confirming a new password).
good_examples:
  - "A 'same as shipping address' option on the billing step."
  - "Declaring textContentType / autofillHints so the OS offers saved values."
bad_examples:
  - "Asking for the postal code on step 1 and again on step 3 of the same flow."
review_check: >-
  Do personal-data fields declare an autofill purpose, and is any value already
  entered in this flow reused instead of requested again?
related: [FORM-003, FORM-004]
sources:
  - title: WCAG 2.2 — 1.3.5 Identify Input Purpose
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: WCAG 2.2 — 3.3.7 Redundant Entry
    url: https://www.w3.org/TR/WCAG22/
    tier: A
last_verified: 2026-08-08
```

```yaml
id: FORM-009
title: Confirm or make reversible any consequential submission
area: components
subcategory: error-prevention
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Submissions with legal, financial, or data-destroying consequences MUST provide
  at least one of: reversibility, checked-and-correctable input, or a review step
  where the user can confirm and correct before finalizing.
rationale: >-
  These actions cannot be undone by re-doing the task, so a mis-tap produces real
  loss for the user rather than mere inconvenience.
values:
  wcag: 3.3.4 Error Prevention (Legal, Financial, Data) — Reversible, Checked, or Confirmed (AA)
applies_to:
  - payments and orders
  - applications and legal agreements
  - bulk deletion or overwrite of user data
exceptions:
  - Low-stakes submissions that are trivially editable afterwards.
good_examples:
  - "An order review screen listing items, address, and total with an Edit link per section before Confirm."
bad_examples:
  - "A one-tap purchase button on a list row with no review and no cancellation window."
review_check: >-
  For each consequential submission in this flow, is there a review step, a
  correction mechanism, or a documented way to reverse it?
related: [FOUND-003, DESTR-001, DLG-002]
sources:
  - title: WCAG 2.2 — 3.3.4 Error Prevention (Legal, Financial, Data)
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: GOV.UK Design System — Question pages
    url: https://design-system.service.gov.uk/patterns/question-pages/
    tier: B
last_verified: 2026-08-08
```
