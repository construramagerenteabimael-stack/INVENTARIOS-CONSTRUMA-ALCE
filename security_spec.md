# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Unauthenticated & Unverified Rejection**: Any request without `request.auth != null` and `request.auth.token.email_verified == true` MUST be rejected (`PERMISSION_DENIED`).
2. **PII Isolation**: Private profile records at `/users/{userId}/private/profile` are strictly readable and writable only by `userId == request.auth.uid`.
3. **Workspace Ownership (Master Gate)**: All inventory subcollections (`zones`, `captures`, `unidentified`, `recounts`, `catalogChunks`, `historySessions`, `historySessionChunks`) require ownership of the parent `/workspaces/{workspaceId}` (`ownerId == request.auth.uid`) on `get`, `create`, `update`, and `delete`.
4. **Immutable Ownership & Creation Time**: `ownerId` and `createdAt` can never change after creation.
5. **Server Timestamp Enforcement**: Every `create` MUST set `createdAt == request.time && updatedAt == request.time`, and every `update` MUST set `updatedAt == request.time`.
6. **Path ID & Payload Boundary Hardening**: Every document ID MUST match `^[a-zA-Z0-9_\-]+$` (max 128 chars), every string MUST enforce `.size()`, and every array chunk MUST be bounded by `.size() <= 1000`.
7. **Zero Client-Delegated List Queries**: Every `allow list` rule enforces `resource.data.ownerId == request.auth.uid` directly without relying on client-only filters or expensive `get()` lookups.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read/write to `/workspaces/ws_u1/captures/cap_1`.
2. Unverified email (`email_verified: false`) attempting write to `/workspaces/ws_u1`.
3. Cross-user workspace read/write (`uid: "u2"` accessing `/workspaces/ws_u1`).
4. Cross-user private PII read (`uid: "u2"` reading `/users/u1/private/profile`).
5. Identity spoofing on create (`uid: "u1"` creating `/workspaces/ws_u1/captures/cap_2` with `ownerId: "u2"`).
6. Ghost/shadow field injection on create (`extraAdminFlag: true` failing `keys().hasOnly(...)`).
7. Shadow field injection on update (`isVerified: true` failing `affectedKeys().hasOnly(...)`).
8. Owner transfer on update (`ownerId` mutated from `"u1"` to `"u2"`).
9. Forged client timestamp on create/update (`createdAt` or `updatedAt` != `request.time`).
10. Resource exhaustion / 1MB string injection (`description` > 300 chars or `photoBase64` > 450,000 chars or chunk `items.size() > 1000`).
11. Invalid ID poisoning (`captureId` = `"bad/id$123"` or > 128 chars failing `isValidId`).
12. Unscoped list query (`allow list` without `where('ownerId', '==', uid)` matching `resource.data.ownerId == request.auth.uid`).
