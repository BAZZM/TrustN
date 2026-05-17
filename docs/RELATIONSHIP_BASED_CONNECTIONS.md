# Relationship-Based Secondary Connections

## Overview

This document describes the relationship-based secondary connections system that allows users to view secondary connections based on their inner circle contacts' relationships.

**Last Updated**: 2024-02-15  
**Migration**: `008_relationship_based_secondary_connections.sql`

## Architecture

### Data Model

#### Inner Circle Connections
- **Definition**: Users who share each other's phone numbers in their imported contacts and both have registered accounts
- **Storage**: `connections` table with `circle_type = 'inner'`
- **Relationship**: Bidirectional (if User A is in User B's inner circle, User B is also in User A's inner circle)

#### Secondary Connections
- **Definition**: Contacts that are in a selected inner circle contact's inner circle, but not already in the primary user's inner circle
- **Computation**: Dynamically calculated based on relationship traversal
- **Filtering**: Can be filtered by `job_role` and `industry`

### Database Schema

#### Connections Table
```sql
CREATE TABLE connections (
  id SERIAL PRIMARY KEY,
  user1_id INTEGER REFERENCES users(id),
  user2_id INTEGER REFERENCES users(id),
  circle_type VARCHAR(20) CHECK (circle_type IN ('inner', 'secondary')),
  strength INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id < user2_id)
);
```

#### Users Table (Enhanced Profile Fields)
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  job_role VARCHAR(255) NOT NULL,
  industry VARCHAR(255) NOT NULL,
  experience TEXT NOT NULL,
  -- ... other fields
);
```

### API Endpoints

#### 1. Get All Connections
**Endpoint**: `GET /api/connections`

**Response**:
```json
{
  "connections": [
    {
      "id": 1,
      "strength": 1,
      "circle_type": "inner",
      "created_at": "2024-01-01T00:00:00Z",
      "peer_id": 2,
      "peer_phone": "+1234567890",
      "peer_name": "Jane Smith",
      "peer_job_role": "Engineer",
      "peer_industry": "Tech",
      "peer_experience": "10 years"
    }
  ]
}
```

**Enhancements**:
- Includes `peer_industry` and `peer_experience` for richer profile data
- Ordered by `circle_type` (inner first), then `strength`, then `created_at`

#### 2. Get Secondary Connections for Inner Circle Contact
**Endpoint**: `GET /api/connections/secondary-for/:innerCircleUserId`

**Query Parameters**:
- `job_role` (optional): Filter by job role (case-insensitive partial match)
- `industry` (optional): Filter by industry (case-insensitive partial match)

**Response**:
```json
{
  "secondaryConnections": [
    {
      "peer_id": 3,
      "peer_phone": "+0987654321",
      "peer_name": "Alice Johnson",
      "peer_job_role": "Designer",
      "peer_industry": "Tech",
      "peer_experience": "5 years",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "innerCircleUserId": 2,
  "filters": {
    "job_role": "Engineer",
    "industry": null
  }
}
```

**Logic**:
1. Verifies that `innerCircleUserId` is in the primary user's inner circle
2. Finds all contacts in `innerCircleUserId`'s inner circle
3. Excludes contacts already in the primary user's inner circle
4. Applies optional filters for `job_role` and `industry`
5. Returns filtered list ordered by name

#### 2b. Unified secondary search (hybrid discovery + FTS)

**Endpoint**: `GET /api/connections/secondary-search`

**Query parameters**:
- `q` (optional): Full-text search on profile fields (`users.user_search_vector`)
- `limit` / `offset` (optional): Pagination (cap 200)
- `focused_inner_peer_id` (optional): Restrict relationship-discovery computation to one inner peer (must be viewer’s inner)
- `branch_only` (optional, `1` / `true`): When combined with `focused_inner_peer_id`, return **only** peers reachable via **`app_secondary_for`** through that inner—as if browsing **that branch**. Omitting `branch_only` (default **false**) keeps the legacy **hybrid** behavior: **union** of (all viewer `secondary` edges) ∪ (discovery rows). **FTS `q` applies in all modes** after candidate selection.

**Used by**: Connections graph (focused inner sends `branch_only=1`), Contacts radial when an inner is selected (`branch_only=1`); hybrid catalog when no inner focus.

**SQL**: `database/migrations/016_unified_secondary_fts.sql` defines `app_unified_secondary_search`; `017_branch_only_unified_secondary.sql` adds `p_branch_only`.

#### 3. Get Inner Circle Contact Profile
**Endpoint**: `GET /api/connections/inner-circle/:userId/profile`

**Response**:
```json
{
  "profile": {
    "id": 2,
    "phone": "+1234567890",
    "name": "Jane Smith",
    "job_role": "Engineer",
    "industry": "Tech",
    "experience": "10 years",
    "created_at": "2024-01-01T00:00:00Z",
    "last_active": "2024-01-15T12:00:00Z"
  }
}
```

**Security**:
- Verifies that the requested user is in the primary user's inner circle
- Returns 403 if user is not in inner circle

### Frontend Implementation

#### Component Flow

1. **User selects inner circle contact** in `DemiRadialNetwork`
2. **`onSelectContact` callback** triggers in `Contacts.js`
3. **`fetchSecondaryConnectionsForInnerCircle`** is called with the selected contact's `peer_id`
4. **API request** is made to `/api/connections/secondary-for/:innerCircleUserId`
5. **Response** updates `relationshipSecondaryConnections` state
6. **`DemiRadialNetwork`** receives updated `secondaryConnections` prop
7. **Secondary ring** displays filtered connections

#### Filtering

- **Job Role Filter**: Text input that filters secondary connections by `job_role`
- **Industry Filter**: Text input that filters secondary connections by `industry`
- **Debouncing**: 300ms delay to prevent excessive API calls while typing
- **Real-time Updates**: Filters trigger new API requests automatically

#### State Management

```javascript
// In Contacts.js
const [relationshipSecondaryConnections, setRelationshipSecondaryConnections] = useState([]);
const [selectedInnerCircleUserId, setSelectedInnerCircleUserId] = useState(null);
const [secondaryJobFilter, setSecondaryJobFilter] = useState("");
const [secondaryIndustryFilter, setSecondaryIndustryFilter] = useState("");
```

### User Experience Flow

1. **View Inner Circle**: User sees their inner circle contacts in the primary ring
2. **Select Contact**: User clicks on an inner circle contact
3. **View Profile**: Inner circle contact's profile shows:
   - Phone number (visible only to inner circle)
   - Job role
   - Industry
   - Experience
4. **View Secondary Connections**: Secondary ring appears showing:
   - Contacts in the selected inner circle contact's inner circle
   - Excludes contacts already in primary user's inner circle
5. **Filter Secondary Connections**: User can filter by:
   - Job role (e.g., "Engineer", "Designer")
   - Industry (e.g., "Tech", "Finance")
6. **Select Secondary Connection**: User can select a secondary connection to view their profile or request a connection

### Security Considerations

1. **Authorization**: All endpoints verify that the requested user is in the primary user's inner circle
2. **Data Privacy**: Phone numbers and detailed profile information are only visible to inner circle contacts
3. **Filtering**: Filters are applied server-side to prevent data leakage
4. **Rate Limiting**: Consider implementing rate limiting for secondary connection queries

### Performance Optimizations

1. **Database Indexes**:
   - `idx_connections_circle_type_user1` on `(circle_type, user1_id)` WHERE `circle_type = 'inner'`
   - `idx_connections_circle_type_user2` on `(circle_type, user2_id)` WHERE `circle_type = 'inner'`
   - `idx_users_job_role` on `job_role`
   - `idx_users_industry` on `industry`

2. **Query Optimization**:
   - Uses `LEFT JOIN` to efficiently exclude existing inner circle contacts
   - Filters applied at database level, not in application code
   - Results ordered by name for consistent display

3. **Frontend Optimizations**:
   - Debounced filter inputs (300ms)
   - Memoized secondary connections list
   - Conditional rendering based on selection state

### Migration

The migration `008_relationship_based_secondary_connections.sql` adds:
- Indexes for faster lookups
- Verification of required user profile fields
- Migration tracking entry

To apply:
```bash
psql -d trust_network -f database/migrations/008_relationship_based_secondary_connections.sql
```

### Testing

#### Test Scenarios

1. **Inner Circle Selection**:
   - Select an inner circle contact
   - Verify secondary connections appear
   - Verify contacts already in inner circle are excluded

2. **Filtering**:
   - Apply job role filter
   - Apply industry filter
   - Apply both filters simultaneously
   - Clear filters

3. **Profile Visibility**:
   - Verify phone number visible for inner circle contacts
   - Verify job role, industry, experience visible
   - Verify profile endpoint returns correct data

4. **Security**:
   - Attempt to access secondary connections for non-inner-circle contact (should fail)
   - Attempt to access profile for non-inner-circle contact (should fail)

### Future Enhancements

1. **Caching**: Cache secondary connections for recently selected inner circle contacts
2. **Pagination**: Add pagination for large secondary connection lists
3. **Sorting**: Allow sorting by name, job role, industry, etc.
4. **Advanced Filters**: Add filters for experience level, location, etc.
5. **Connection Strength**: Display connection strength indicators
6. **Mutual Connections**: Show mutual connections between primary user and secondary connections
