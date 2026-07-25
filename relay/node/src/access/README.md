# `access/` — portable role model core

Role-based access control as a self-contained unit: a permission catalogue, a
`role → permissions` map, and one decision function. Nothing else.

## The one rule

**No file in this directory imports anything from outside it.** No configuration,
no HTTP, no storage, no framework. That is the whole reason the directory is
portable — break the rule and porting turns back into refactoring.

Everything environment-specific lives in adapters *outside* the core:

| Adapter | Responsibility |
| --- | --- |
| `relay/node/src/lib/auth.ts` | Session JWT → `AccessSubject` |
| `relay/node/src/lib/http.ts` | `requirePermission()` — 401/403 responses |
| `panel/src/access/` | Refine `accessControlProvider` |

## Files

| File | Contents |
| --- | --- |
| `permissions.ts` | `PERMISSIONS` catalogue, `Permission` type, `isPermission()` |
| `roles.ts` | `ROLES`, `Role`, `ROLE_PERMISSIONS`, `isRole()` |
| `can.ts` | `AccessSubject`, `can()`, `canAll()`, `permissionsOf()` |
| `index.ts` | Public surface — import from here, not from the files directly |

## Usage

```ts
import { can, permissionsOf } from "./access/index.ts";

can({ role: "moderator" }, "logs.audit.read");   // true
can({ role: "viewer" }, "logs.audit.read");      // false
can(null, "waitlist.read");                      // false — fails closed
permissionsOf("admin");                          // every permission in the catalogue
```

## Design decisions

- **Flat permissions.** A permission is one string, not a resource/action pair, so
  a check is one lookup and the catalogue reads as a list.
- **Flat roles.** No inheritance: a role's full power is visible in one place and a
  change to it is a reviewable diff.
- **`"*"` for admin.** Admin never silently loses access when a permission is added.
- **Fails closed.** A missing subject or an unrecognised role is denied, never
  defaulted.
- **Permission strings are stable identifiers.** They travel in session payloads
  and client-side checks, so renaming one is a migration, not a rename.

## Porting to another project

1. Copy this directory.
2. Rewrite `permissions.ts` and `roles.ts` for the new domain — these two files are
   the only project-specific content.
3. Write the adapters for the new transport and UI framework.
4. Copy the core tests (`relay/node/test/access.test.ts`) and adjust the expected
   role/permission names.

## Extending later

Per-user grants and denials on top of a role are intentionally not implemented. When
they are needed, add the fields to `AccessSubject` and resolve them inside `can()` —
the signature callers depend on does not change:

```ts
export interface AccessSubject {
  role: Role;
  grants?: readonly Permission[];   // added on top of the role
  denies?: readonly Permission[];   // taken away
}
```
