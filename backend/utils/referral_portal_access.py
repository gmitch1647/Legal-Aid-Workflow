"""Shared authorization helpers for isolated referral-attorney portals."""

from __future__ import annotations


def get_referral_portal_partner(supabase, profile: dict) -> dict | None:
    """Return the active partner workspace available to this affiliate user.

    A referral attorney owns a workspace through ``portal_user_id``. Invited
    staff are granted access only through an active membership record. Both
    paths return the same partner record, which keeps every downstream case
    filter anchored to ``cases.referral_partner_id``.
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
        .select("referral_partner_id")
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


def is_referral_portal_owner(partner: dict | None, profile: dict) -> bool:
    """Return whether the affiliate is the referral attorney who owns the workspace."""
    return bool(partner and profile.get("id") and str(partner.get("portal_user_id")) == str(profile.get("id")))
