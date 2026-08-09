# DOMAIN V2

## Purpose

This document defines the normalized domain vocabulary for EntryFlow after the product evolved from a single-client operational app into a platform capable of serving multiple event formats.

The goal is not to replace the current implementation overnight.
The goal is to establish a canonical contract for the future while keeping the current mock application fully functional and visually unchanged.

## North Star

EntryFlow should stop thinking of itself as "a reservations app for one venue" and start thinking of itself as "a platform for operational event control".

That means the core unit is no longer the screen.
The core unit is the event, and everything else hangs off that event:

- attendees
- access grants
- admission attempts
- resources
- activity
- operations

Reservations, Tables, Customers, Check-in, Timeline, Dashboard and Operations remain useful product surfaces today, but they should be understood as views over a broader event operating model.

## Canonical hierarchy

```text
Organization
└── Event
    ├── Attendees
    │   └── AccessGrants
    │       └── Admissions
    ├── Resources
    ├── Activity
    ├── Operations
    └── Analytics
```

## Entity model

### Organization

Organization is the tenant container.

It represents the business entity that owns events, branding, settings, terminology, permissions and future multi-company separation.

Suggested contract:

- `id`
- `name`
- `slug`
- `status`
- `timezone`
- `branding`
- `settings`
- `metadata`

Important note:

- We are not implementing real multi-tenancy yet.
- We are only defining the contract so the future backend can store it without changing the product language again.

### Event

Event is the operational unit of the platform.

Everything visible in the product should eventually be scoped to an event.

Suggested contract:

- `id`
- `organizationId`
- `name`
- `description`
- `eventType`
- `status`
- `startAt`
- `endAt`
- `timezone`
- `venue`
- `capacity`
- `enabledModules`
- `operationalModel`
- `admissionMethods`
- `metadata`

The event is where product behavior becomes contextual:

- a nightclub event may enable access control, resources, operations and activity
- a conference may enable agenda, badges, admissions and analytics
- a private event may enable only reservations, attendees and admission

### EventType

EventType is an extensible domain classification, not a UI label.

Initial values:

- `nightlife`
- `concert`
- `festival`
- `corporate`
- `conference`
- `seminar`
- `workshop`
- `theatre`
- `sports`
- `private`
- `custom`

These values should not imply different code paths yet.
They only describe the event contract and allow future module presets.

### EventModule

Event modules are the functional capabilities that can be enabled per event.

Base modules:

- `overview`
- `access`
- `attendees`
- `admission`
- `resources`
- `operations`
- `activity`
- `analytics`
- `notifications`

Optional future modules:

- `ticketing`
- `payments`
- `badges`
- `agenda`
- `staff`
- `gates`
- `capacity-control`
- `communications`

Key principle:

- modules are a capability contract, not a sidebar contract
- the sidebar should stay stable until module-based navigation is intentionally designed

### Attendee

Attendee is the person-level identity tied to an event.

It is the conceptual replacement for Customer/Guest in the future domain.

Suggested contract:

- `id`
- `eventId`
- `name`
- `firstName`
- `lastName`
- `email`
- `phone`
- `document`
- `status`
- `tags`
- `notes`
- `metadata`

Attendee is intentionally broader than the current "guest inside a reservation" model.

That gives the platform room to support:

- invited guests
- walk-ins
- corporate attendees
- ticket holders
- staff
- exhibitors
- accredited visitors

### AccessGrant

AccessGrant is the right to access an event.

This is the central normalized concept behind future access control.

Important nuance:

- AccessGrant does not replace everything.
- AccessGrant is not "the whole app".
- It specifically represents the right an attendee has to enter or participate in the event.

Suggested contract:

- `id`
- `eventId`
- `attendeeId`
- `type`
- `status`
- `validFrom`
- `validUntil`
- `usesAllowed`
- `usesConsumed`
- `resourceAssignments`
- `admissionRules`
- `source`
- `metadata`

Initial types:

- `ticket`
- `invitation`
- `reservation`
- `guest-list`
- `accreditation`
- `staff-pass`
- `vip-pass`
- `courtesy`
- `registration`

This is the correct place to say that a legacy reservation can be interpreted as a reservation-backed access grant.

That does not mean the Reservation feature disappears yet.
It means the domain now understands how to model it.

### Admission

Admission is the normalized concept behind Check-in.

The current route and UI can remain `/check-in`.
The domain behind it should be admission.

Suggested contract:

- `AdmissionAttempt`
- `AdmissionResult`
- `AdmissionMethod`
- `AdmissionStatus`

Admission methods:

- `qr`
- `code`
- `manual`
- `list`
- `ticket`
- `invitation`
- `credential`

Admission outcomes:

- `success`
- `denied`
- `already-used`
- `cancelled`
- `invalid`
- `blocked`
- `manual`

This allows the current check-in behavior to be understood as a subset of a broader admission model.

### Resources

Resource is the normalized concept behind Tables and other spatial or operational assets.

Tables should be treated as one specialized resource type, not the only possible resource model.

Suggested contract:

- `id`
- `eventId`
- `type`
- `name`
- `capacity`
- `status`
- `parentResourceId`
- `metadata`

Initial resource types:

- `table`
- `seat`
- `zone`
- `box`
- `room`
- `booth`
- `area`

This lets the platform eventually support:

- tables
- seats
- VIP boxes
- rooms
- zones
- stages
- staff areas
- entrances

### Activity

Activity is the normalized concept behind Timeline.

The current UI can remain a timeline.
The contract should be activity-oriented.

Suggested contract:

- `id`
- `eventId`
- `timestamp`
- `kind`
- `icon`
- `color`
- `title`
- `description`
- `reservationId`
- `attendeeId`
- `accessGrantId`
- `resourceId`
- `admissionAttemptId`
- `metadata`

Activity is the unified operational history of the event.

It can contain:

- reservation created
- attendee added
- access granted
- resource assigned
- admission attempted
- admission succeeded
- admission denied
- alert raised
- alert resolved

## Module ownership

### Overview

Owns:

- executive summary
- key metrics
- event snapshot

### Access

Owns:

- access rights
- access grant lifecycle
- source of access

### Attendees

Owns:

- people
- identities
- contact data
- tags

### Admission

Owns:

- attempts
- validation outcomes
- gate logic
- manual fallback

### Resources

Owns:

- physical or logical event resources
- assignment
- occupancy
- capacity

### Operations

Owns:

- operational alerts
- critical states
- issue triage
- supervisory view

### Activity

Owns:

- chronological event history
- operational traceability
- audit-friendly feed

### Analytics

Owns:

- derived metrics
- occupancy
- admission rates
- flow analysis

### Notifications

Owns:

- feedback
- alerts
- undo affordances
- user-facing system messages

## Compatibility layer

This is the most important part of the migration strategy.

The platform must remain backward compatible while the new domain is introduced.

### Current implementation -> Future domain

| Current implementation | Future domain |
| --- | --- |
| Reservations | Access Grants / Reservations |
| Customers | Attendees |
| Guest | Attendee |
| Tables | Resources / Tables |
| Check-in | Admission |
| Timeline | Activity |
| Operations | Command Center |
| Dashboard | Overview |
| Statistics | Analytics |

### Compatibility rules

- Existing routes stay the same.
- Existing labels stay the same for now.
- Existing mock behavior stays the same.
- Existing shared state remains the single source of truth in the mock app.
- New contracts should describe the future, not force an immediate rename of the UI.

### Mapping principles

- `Reservation` can be interpreted as an `AccessGrant` with `type = reservation`
- `Guest` and `Customer` can be interpreted as `Attendee`
- `Table` can be interpreted as `Resource(type = table)`
- `CheckIn` can be interpreted as `Admission`
- `TimelineEntry` can be interpreted as `ActivityEntry`

This gives the product a stable vocabulary for future backend work while preserving the current implementation.

## What stays exactly the same now

- `/reservations` remains `/reservations`
- `/customers` remains `/customers`
- `/check-in` remains `/check-in`
- `/tables` remains `/tables`
- `/timeline` remains `/timeline`
- `/operations` remains `/operations`
- the current premium UI language stays intact
- the mock shared state remains the source of truth
- no new backend is introduced
- no destructive migration is performed
- no dynamic module navigation is introduced yet

## Terminology map

| Legacy term | Normalized term |
| --- | --- |
| Reservations | Access Grants / Reservations |
| Customers | Attendees |
| Guest | Attendee |
| Tables | Resources / Tables |
| Check-in | Admission |
| Timeline | Activity |
| Operations | Command Center |
| Dashboard | Overview |
| Statistics | Analytics |

## Design decisions

1. The platform entity is `Organization`, not venue, not branch, not account.
2. The operational entity is `Event`.
3. The person entity is `Attendee`.
4. The access entity is `AccessGrant`.
5. The door-logic entity is `Admission`.
6. The spatial entity is `Resource`.
7. The history entity is `Activity`.
8. Legacy UI names remain until the migration is intentionally executed.
9. The mock shared state remains a single source of truth.
10. The domain contract should be future-proof without becoming abstract noise.

## Risks

- Over-normalizing too early could create unnecessary indirection.
- Renaming UI labels too soon would create unnecessary cognitive load for operators.
- Treating Access as a generic bucket would blur the distinction between rights, attempts and outcomes.
- Making Resources too specific to tables would block future event formats.
- Merging legacy state and normalized state too aggressively could create duplicate sources of truth.
- Introducing module-based navigation before the event model is ready would make the product feel unstable.

## Migration strategy

### Phase 1

Define the normalized domain contract and compatibility helpers.

### Phase 2

Gradually map current mock data and derived views to the new contracts internally.

### Phase 3

Introduce event presets and module presets once the domain contract is stable.

### Phase 4

Only after the data model and workflows are stable, begin visible terminology migration in the UI.

## Textual diagram

```text
Organization
└── Event
    ├── Attendees
    │   └── AccessGrants
    │       └── Admissions
    ├── Resources
    ├── Activity
    ├── Operations
    └── Analytics
```

## Final note

This sprint is about normalizing language, ownership and contracts.

It is not about changing product behavior.
It is not about removing legacy surfaces.
It is not about forcing the UI to speak the new domain before the product is ready.

The safest evolution is to let the implementation keep working exactly as it does today while the domain contract becomes explicit, stable and platform-ready.

