"""
Experian Credit Report API integration.

Pulls credit reports and scores directly from Experian's API
for use in the disputer, client profiles, and evidence preservation.
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

EXPERIAN_AUTH_URL = "https://sandbox-us-api.experian.com/oauth2/v1/token"
EXPERIAN_CREDIT_URL = "https://sandbox-us-api.experian.com/consumerservices/credit-profile/v2/credit-report"


def _get_credentials():
    return {
        "client_id": os.environ.get("EXPERIAN_CLIENT_ID", ""),
        "client_secret": os.environ.get("EXPERIAN_CLIENT_SECRET", ""),
        "username": os.environ.get("EXPERIAN_USERNAME", ""),
        "password": os.environ.get("EXPERIAN_PASSWORD", ""),
        "subscriber_code": os.environ.get("EXPERIAN_SUBSCRIBER_CODE", ""),
        "company_id": os.environ.get("EXPERIAN_COMPANY_ID", ""),
    }


def is_configured():
    creds = _get_credentials()
    return bool(creds["client_id"] and creds["client_secret"])


async def get_access_token() -> str:
    """Get OAuth2 access token from Experian using Password Grant."""
    creds = _get_credentials()

    auth_body = {
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "username": creds["username"],
        "password": creds["password"],
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            EXPERIAN_AUTH_URL,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Grant_type": "password",
            },
            json=auth_body,
        )

        if resp.status_code != 200:
            logger.error(f"Experian auth failed: {resp.status_code} {resp.text}")
            raise Exception(f"Experian authentication failed: {resp.status_code} — {resp.text[:300]}")

        data = resp.json()
        return data.get("access_token", "")


async def pull_credit_report(
    first_name: str,
    last_name: str,
    ssn: str,
    dob: str,
    address: str,
    city: str,
    state: str,
    zip_code: str,
    middle_name: str = "",
) -> dict:
    """Pull a full credit report from Experian.

    Args:
        first_name, last_name: Consumer's legal name
        ssn: Full 9-digit SSN (no dashes)
        dob: Date of birth (MMDDYYYY or MM/DD/YYYY)
        address, city, state, zip_code: Current address

    Returns:
        Full Experian credit report as structured JSON
    """
    token = await get_access_token()
    creds = _get_credentials()

    # Normalize DOB format
    dob_clean = dob.replace("/", "").replace("-", "")

    request_body = {
        "creditProfile": {
            "subscriber": {
                "preamble": "TEST",
                "subscriberCode": creds.get("subscriber_code", "5991764"),
            },
            "primaryApplicant": {
                "name": {
                    "surname": last_name,
                    "firstName": first_name,
                    "middleName": middle_name,
                },
                "ssn": ssn.replace("-", "").replace(" ", ""),
                "dob": dob_clean,
            },
            "address": {
                "currentAddress": {
                    "street": address,
                    "city": city,
                    "state": state,
                    "zipCode": zip_code,
                }
            },
            "otherInformation": {
                "referenceNumber": "LEGALFLOW",
            },
            "addOns": {
                "riskModels": {
                    "modelIndicator": ["V4"],
                },
            },
        }
    }

    async with httpx.AsyncClient() as client:
        company_id = os.environ.get("EXPERIAN_COMPANY_ID") or os.environ.get("EXPERIAN_CLIENT_ID") or "0"
        logger.info(f"[Experian] Using companyId: {company_id[:8]}...")

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "clientReferenceId": "LEGALFLOW",
            "companyId": company_id,
        }

        resp = await client.post(
            EXPERIAN_CREDIT_URL,
            headers=headers,
            json=request_body,
            timeout=30,
        )

        if resp.status_code != 200:
            logger.error(f"Experian credit pull failed: {resp.status_code} {resp.text}")
            raise Exception(f"Experian credit pull failed: {resp.status_code} — {resp.text[:500]}")

        return resp.json()


def extract_accounts_from_report(report_data: dict) -> list:
    """Extract structured account data from Experian API response."""
    accounts = []

    credit_report = report_data.get("creditProfile", report_data)

    # Tradelines
    for trade in credit_report.get("tradeline", []):
        account = {
            "creditor": trade.get("subscriberName", "Unknown"),
            "accountNumber": trade.get("accountNumber", ""),
            "category": "adverse-account",
            "balance": str(trade.get("balanceAmount", "")),
            "pastDue": str(trade.get("amountPastDue", "")),
            "highBalance": str(trade.get("highCreditAmount", "")),
            "creditLimit": str(trade.get("creditLimitAmount", "")),
            "dateOpened": trade.get("dateOpened", ""),
            "dateClosed": trade.get("dateClosed", ""),
            "lastPaymentMade": trade.get("lastPaymentDate", ""),
            "payStatus": trade.get("paymentStatus", trade.get("accountCondition", "")),
            "originalCreditor": trade.get("originalCreditorName", ""),
            "remarks": ", ".join(trade.get("remarks", [])) if isinstance(trade.get("remarks"), list) else str(trade.get("remarks", "")),
            "accountType": trade.get("accountType", ""),
            "bureau": "experian",
        }

        # Determine if negative
        status = (account["payStatus"] or "").lower()
        is_negative = any(neg in status for neg in [
            "charge", "collection", "delinquent", "late", "past due",
            "bankruptcy", "foreclosure", "repossession", "surrender",
            "written off", "profit and loss", "settled",
        ])

        # Check payment history for late payments
        payment_history = trade.get("paymentHistory", [])
        late_months = []
        for ph in payment_history:
            rating = ph.get("status", ph.get("paymentStatus", ""))
            if rating and rating not in ("C", "0", "OK", "Current"):
                late_months.append(f"{ph.get('date', '?')} = {rating}")

        if late_months:
            is_negative = True
            account["negativeFindings"] = [
                {"description": f"Late payment history: {', '.join(late_months[:12])}", "severity": "high"}
            ]

        if int(account.get("pastDue") or "0") > 0:
            is_negative = True

        if is_negative:
            account["negativeFindings"] = account.get("negativeFindings", [])
            if "charge" in status:
                account["disputeType"] = "charge-off"
            elif "collection" in status:
                account["disputeType"] = "collection"
            elif late_months:
                account["disputeType"] = "late"
            else:
                account["disputeType"] = "unknown"

            account["id"] = f"exp-{len(accounts)}-{hash(account['creditor'])}"
            account["customFindings"] = []
            account["includeConsumerStatement"] = False
            accounts.append(account)

    # Collections
    for coll in credit_report.get("collection", []):
        account = {
            "id": f"exp-coll-{len(accounts)}",
            "creditor": coll.get("subscriberName", coll.get("creditorName", "Unknown")),
            "accountNumber": coll.get("accountNumber", ""),
            "category": "collection",
            "balance": str(coll.get("balanceAmount", "")),
            "pastDue": str(coll.get("amountPastDue", "")),
            "highBalance": str(coll.get("originalAmount", "")),
            "creditLimit": "",
            "dateOpened": coll.get("dateOpened", coll.get("dateAssigned", "")),
            "dateClosed": "",
            "lastPaymentMade": coll.get("lastPaymentDate", ""),
            "payStatus": "Collection",
            "originalCreditor": coll.get("originalCreditorName", ""),
            "remarks": "",
            "disputeType": "collection",
            "bureau": "experian",
            "negativeFindings": [
                {"description": f"Collection account — original creditor: {coll.get('originalCreditorName', 'unknown')}, balance: ${coll.get('balanceAmount', '?')}", "severity": "high"}
            ],
            "customFindings": [],
            "includeConsumerStatement": False,
        }
        accounts.append(account)

    # Public Records
    for pr in credit_report.get("publicRecord", []):
        account = {
            "id": f"exp-pr-{len(accounts)}",
            "creditor": pr.get("courtName", pr.get("subscriberName", "Public Record")),
            "accountNumber": pr.get("referenceNumber", ""),
            "category": "public-record",
            "balance": str(pr.get("liabilityAmount", "")),
            "pastDue": "",
            "highBalance": "",
            "creditLimit": "",
            "dateOpened": pr.get("dateFiled", ""),
            "dateClosed": "",
            "lastPaymentMade": "",
            "payStatus": pr.get("type", pr.get("status", "")),
            "originalCreditor": "",
            "remarks": pr.get("courtType", ""),
            "disputeType": "bankruptcy" if "bankrupt" in str(pr.get("type", "")).lower() else "unknown",
            "bureau": "experian",
            "negativeFindings": [
                {"description": f"Public record: {pr.get('type', 'unknown')} filed {pr.get('dateFiled', '?')}", "severity": "high"}
            ],
            "customFindings": [],
            "includeConsumerStatement": False,
        }
        accounts.append(account)

    return accounts


def extract_scores_from_report(report_data: dict) -> dict:
    """Extract credit scores from Experian API response."""
    credit_report = report_data.get("creditProfile", report_data)
    scores = {}

    for score in credit_report.get("riskModel", []):
        model = score.get("modelIndicator", "")
        value = score.get("score", 0)
        factors = score.get("scoreFactors", [])

        scores[model] = {
            "score": value,
            "factors": [
                {"code": f.get("code", ""), "description": f.get("description", "")}
                for f in (factors if isinstance(factors, list) else [])
            ],
        }

    return scores
