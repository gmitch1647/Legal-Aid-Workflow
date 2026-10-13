"""Firm-owned email notification routing helpers.

LegalFlow sends client, attorney, and referral-partner messages to their own
addresses.  Firm-level operational alerts can be routed independently through
the configured owner profile's notification preferences, so changing an alert
inbox never changes that person's LegalFlow sign-in address.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)
FIRM_NOTIFICATION_EMAIL_KEY = "firm_notification_email"


def _normalized_email(value: object) -> str | None:
    candidate = str(value or "").strip().lower()
    if not candidate or "@" not in candidate or candidate.startswith("@") or candidate.endswith("@"):
        return None
    return candidate


def notification_email_for_profile(profile: dict[str, Any] | None) -> str | None:
    """Return a profile's separate firm-alert inbox, or its normal email.

    The optional preference is deliberately used only by firm-side operational
    notices. It does not modify the profile email stored by Supabase Auth and
    therefore cannot unexpectedly alter the person's LegalFlow login.
    """
    profile = profile or {}
    preferences = profile.get("notification_preferences")
    if isinstance(preferences, dict):
        configured = _normalized_email(preferences.get(FIRM_NOTIFICATION_EMAIL_KEY))
        if configured:
            return configured
    return _normalized_email(profile.get("email"))


def firm_notification_recipient(supabase) -> tuple[str | None, dict[str, Any] | None]:
    """Return the active settlement-review owner and resolved alert inbox."""
    try:
        reviewer = (
            supabase.table("settlement_package_reviewers")
            .select("owner_profile_id")
            .eq("active", True)
            .limit(1)
            .execute()
        )
        owner_id = ((reviewer.data or [None])[0] or {}).get("owner_profile_id")
        if owner_id:
            owner = (
                supabase.table("profiles")
                .select("id,email,full_name,notification_preferences")
                .eq("id", owner_id)
                .limit(1)
                .execute()
            )
            owner_profile = ((owner.data or [None])[0] or None)
            recipient = notification_email_for_profile(owner_profile)
            if recipient:
                return recipient, owner_profile
    except Exception:
        logger.warning("Could not resolve the configured LegalFlow notification owner", exc_info=True)

    try:
        fallback = (
            supabase.table("profiles")
            .select("id,email,full_name,notification_preferences")
            .eq("role", "attorney")
            .order("created_at")
            .limit(1)
            .execute()
        )
        fallback_profile = ((fallback.data or [None])[0] or None)
        return notification_email_for_profile(fallback_profile), fallback_profile
    except Exception:
        logger.warning("Could not resolve the fallback LegalFlow notification owner", exc_info=True)
        return None, None
