# 🔧 PostgreSQL Enum Type Migration Fix

## Problem Explained

### What Happened:
```
sqlalchemy.exc.ProgrammingError: type "filtertype" does not exist
```

### Root Cause:
PostgreSQL requires **custom enum types to be created BEFORE they can be used in table columns**.

The Alembic auto-generated migration tried to:
```python
# ❌ WRONG ORDER:
op.add_column('email_filters', 
    sa.Column('filter_type', sa.Enum(..., name='filtertype'), ...)
)
# But 'filtertype' enum doesn't exist yet!
```

### Why This Happens:
1. **SQLAlchemy's Enum** creates a PostgreSQL TYPE (e.g., `CREATE TYPE filtertype AS ENUM (...)`)
2. **Alembic auto-generate** doesn't always detect when to create the TYPE
3. **PostgreSQL** throws error when you try to use a type that doesn't exist

---

## The Fix Applied

### Updated Migration File:
`backend/alembic/versions/34ac2a15aa6c_first_migration.py`

#### ✅ BEFORE any table creation:
```python
def upgrade() -> None:
    # Create enum types FIRST before using them in columns
    filtertype_enum = postgresql.ENUM('SENDER', 'SUBJECT', 'BODY', 'CUSTOM', name='filtertype')
    filtertype_enum.create(op.get_bind(), checkfirst=True)
    
    actiontype_enum = postgresql.ENUM('NOTIFY', 'WHATSAPP', 'ARCHIVE', name='actiontype')
    actiontype_enum.create(op.get_bind(), checkfirst=True)
    
    plantype_enum = postgresql.ENUM('FREE', 'BASIC', 'PRO', name='plantype')
    plantype_enum.create(op.get_bind(), checkfirst=True)
    
    # NOW create tables that use these enums
    op.create_table('plans', ...)
```

#### ✅ AFTER all tables dropped in downgrade:
```python
def downgrade() -> None:
    # Drop all tables first
    op.drop_table('plans')
    ...
    
    # Drop enum types LAST after all columns using them are dropped
    filtertype_enum = postgresql.ENUM('SENDER', 'SUBJECT', 'BODY', 'CUSTOM', name='filtertype')
    filtertype_enum.drop(op.get_bind(), checkfirst=True)
    
    actiontype_enum = postgresql.ENUM('NOTIFY', 'WHATSAPP', 'ARCHIVE', name='actiontype')
    actiontype_enum.drop(op.get_bind(), checkfirst=True)
    
    plantype_enum = postgresql.ENUM('FREE', 'BASIC', 'PRO', name='plantype')
    plantype_enum.drop(op.get_bind(), checkfirst=True)
```

---

## How to Apply the Fix

### Option 1: Reset Database (Recommended for Development)

#### A. Using Docker:
```powershell
cd backend
.\reset_db_docker.ps1
```

This will:
1. Drop all tables and enum types
2. Run migrations fresh
3. Seed plans

#### B. Using Local PostgreSQL:
```powershell
cd backend
.\reset_db.ps1
```

### Option 2: Manual SQL Fix (If you have data to keep)

```powershell
# Connect to database
docker-compose exec postgres psql -U emailfilter -d emailfilter

# Or local:
psql -U emailfilter -d emailfilter
```

Then run:
```sql
-- Create missing enum types
CREATE TYPE filtertype AS ENUM ('SENDER', 'SUBJECT', 'BODY', 'CUSTOM');
CREATE TYPE actiontype AS ENUM ('NOTIFY', 'WHATSAPP', 'ARCHIVE');
CREATE TYPE plantype AS ENUM ('FREE', 'BASIC', 'PRO');

-- Now run migration
\q
```

```powershell
alembic upgrade head
```

### Option 3: Drop and Recreate (Nuclear option)

```powershell
# Drop database entirely
docker-compose exec postgres psql -U postgres -c "DROP DATABASE emailfilter;"
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE emailfilter OWNER emailfilter;"

# Run migrations
alembic upgrade head

# Seed data
python seed_db.py
```

---

## Verify the Fix

### 1. Check Enum Types Exist:
```powershell
docker-compose exec postgres psql -U emailfilter -d emailfilter -c "\dT+"
```

Should show:
```
 Schema |    Name    | Type | Owner
--------+------------+------+----------
 public | actiontype | enum | emailfilter
 public | filtertype | enum | emailfilter
 public | plantype   | enum | emailfilter
```

### 2. Check Tables Created:
```powershell
docker-compose exec postgres psql -U emailfilter -d emailfilter -c "\dt"
```

Should show all 8 tables:
- users
- plans
- user_plans
- connected_emails
- email_filters
- filtered_emails
- notification_preferences
- usage_metrics

### 3. Check Migration Version:
```powershell
alembic current
```

Should show:
```
34ac2a15aa6c (head)
```

---

## Understanding PostgreSQL Enum Types

### What are Enum Types?
PostgreSQL custom types that restrict a column to specific values:

```sql
CREATE TYPE filtertype AS ENUM ('SENDER', 'SUBJECT', 'BODY', 'CUSTOM');
```

### How SQLAlchemy Uses Them:
```python
# In models.py
class FilterType(str, enum.Enum):
    SENDER = "sender"
    SUBJECT = "subject"
    BODY = "body"
    CUSTOM = "custom"

# In table definition
filter_type: Mapped[FilterType] = mapped_column(SQLEnum(FilterType), nullable=False)
```

### Migration Order:
```
1. CREATE TYPE filtertype ...        ← MUST be first
2. CREATE TABLE ... (                ← Then tables
     filter_type filtertype ...
   )
3. ... use tables ...
4. DROP TABLE ...                    ← Drop tables first
5. DROP TYPE filtertype              ← Then drop types
```

---

## Future Prevention

### When Creating New Enums:

Always explicitly create the type in migration:

```python
def upgrade():
    # Create enum type first
    from sqlalchemy.dialects import postgresql
    
    my_enum = postgresql.ENUM('VALUE1', 'VALUE2', name='myenum')
    my_enum.create(op.get_bind(), checkfirst=True)
    
    # Then create table
    op.create_table('my_table',
        sa.Column('my_col', sa.Enum(..., name='myenum'), ...),
        ...
    )

def downgrade():
    # Drop table first
    op.drop_table('my_table')
    
    # Then drop enum
    my_enum = postgresql.ENUM('VALUE1', 'VALUE2', name='myenum')
    my_enum.drop(op.get_bind(), checkfirst=True)
```

---

## Troubleshooting

### Error: "type already exists"
```sql
-- Check if type exists
SELECT typname FROM pg_type WHERE typname = 'filtertype';

-- If it exists but migration fails, drop it manually:
DROP TYPE filtertype CASCADE;
-- Then re-run migration
```

### Error: "cannot drop type because other objects depend on it"
```sql
-- Find dependent objects
SELECT 
    t.table_name,
    c.column_name
FROM information_schema.columns c
JOIN information_schema.tables t ON c.table_name = t.table_name
WHERE c.udt_name = 'filtertype';

-- Drop tables first, then type
```

### Error: "relation already exists"
```powershell
# Reset everything
.\reset_db_docker.ps1
```

---

## Summary

| Issue | Solution |
|-------|----------|
| **Type not found** | Create enum types BEFORE table creation |
| **Migration fails** | Use `reset_db_docker.ps1` to start fresh |
| **Type already exists** | Use `checkfirst=True` in enum.create() |
| **Can't drop type** | Drop tables BEFORE dropping enum types |

---

**Status**: ✅ Migration file fixed with proper enum type creation order!

**Next Step**: Run `.\reset_db_docker.ps1` to apply the fix.
