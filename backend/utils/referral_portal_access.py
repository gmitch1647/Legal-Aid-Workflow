"""Shared authorization helpers for isolated referral-attorney portals."""

from __future__ import annotations


def get_referral_portal_partner(supabase, profile: dict) -> dict | None:
    """Return the active partner workspace available to this affiliate user.

    The referral attorney owns a workspace through ``portal_user_id``. Invited
    staff and co-owners are granted access only through an active membership
    record. Every path returns the same partner record, keeping downstream case
    filters anchored to ``cases.referral_partner_id``.
    """
    if profile.get("role") != "affiliate" or not profile.get("id"):
        return None

    owner_response = (
        supabase.table("referral_partners")
        .select("*")
        .eq("portal_user_id", profile["id"])
        .eq("portal_active", True)
        .limit(1)
        .execute()
    )
    owner_partner = (owner_response.data or [None])[0]
    if owner_partner:
        return owner_partner

    membership_response = (
        supabase.table("referral_portal_team_members")
        .select("referral_partner_id,access_level")
        .eq("profile_id", profile["id"])
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    membership = (membership_response.data or [None])[0]
    if not membership or not membership.get("referral_partner_id"):
        return None

    partner_response = (
        supabase.table("referral_partners")
        .select("*")
        .eq("id", membership["referral_partner_id"])
        .eq("portal_active", True)
        .limit(1)
        .execute()
    )
    return (partner_response.data or [None])[0]


def get_referral_portal_access_level(supabase, partner: dict | None, profile: dict) -> str | None:
    """Return ``owner``, ``co_owner``, or ``member`` for one active workspace."""
    if not partner or profile.get("role") != "affiliate" or not profile.get("id"):
        return None
    if str(partner.get("portal_user_id")) == str(profile.get("id")):
        return "owner"

    membership_response = (
        supabase.table("referral_portal_team_members")
        .select("access_level")
        .eq("referral_partner_id", partner["id"])
        .eq("profile_id", profile["id"])
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    membership = (membership_response.data or [None])[0]
    return str(membership.get("access_level") or "member") if membership else None


def is_referral_portal_owner(supabase, partner: dict | None, profile: dict) -> bool:
    """Return whether this user is the original owner or a designated co-owner."""
    return get_referral_portal_access_level(supabase, partner, profile) in {"owner", "co_owner"}
