-- Staff attorneys table — tracks attorney team members and their client assignments
-- Separate from the 'attorneys' table which is just for signature blocks

-- Add assigned_attorney field to profiles (for client assignment)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_attorney_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Add role option for staff attorneys
-- Existing roles: 'attorney' (admin), 'client'
-- New role: 'staff_attorney' (team member with limited access)

CREATE INDEX IF NOT EXISTS idx_profiles_assigned_attorney ON profiles(assigned_attorney_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
