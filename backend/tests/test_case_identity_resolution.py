import unittest

from routers import cases


class CaseIdentityResolutionTests(unittest.TestCase):
    def test_owner_profile_is_never_accepted_as_a_client(self):
        owner = {"id": "owner-1", "role": "attorney", "full_name": "Gary Mitchell"}
        self.assertFalse(
            cases._client_profile_matches_case_plaintiff(
                owner,
                "Jeremiah Covington v. TransUnion",
            )
        )

    def test_case_label_matches_client_name_before_defendant(self):
        client = {"id": "client-1", "role": "client", "full_name": "Jeremiah Covington"}
        self.assertTrue(
            cases._client_profile_matches_case_plaintiff(
                client,
                "Jeremiah Covington v. TransUnion",
            )
        )

    def test_wrong_client_profile_is_rejected(self):
        wrong_client = {"id": "client-1", "role": "client", "full_name": "Jameika Thomas"}
        self.assertFalse(
            cases._client_profile_matches_case_plaintiff(
                wrong_client,
                "Sierra Hopkins v. Experian",
            )
        )

    def test_structured_import_uses_source_client_name_not_owner(self):
        case = {
            "plaintiff_name": "Jeremiah Covington v. Experian",
            "case_facts": '{"case_name":"Jeremiah Covington v. Experian","client_name":"Jeremiah Covington"}',
        }
        owner = {"id": "owner-1", "role": "attorney", "full_name": "Gary Mitchell"}
        self.assertEqual(cases._case_plaintiff_name(case, owner), "Jeremiah Covington")

    def test_legacy_header_uses_recorded_plaintiff_name(self):
        case = {
            "plaintiff_name": "Shauna Turner Wright v. TransUnion",
            "case_facts": "=== PLAINTIFF ===\nName: Shauna Turner Wright\nEmail: client@example.com",
        }
        self.assertEqual(cases._case_plaintiff_name(case, None), "Shauna Turner Wright")

    def test_client_profile_is_accepted_when_legacy_case_label_is_blank(self):
        client = {"id": "client-1", "role": "client", "full_name": "Shannon Cholko"}
        self.assertTrue(cases._client_profile_matches_case_plaintiff(client, None))


if __name__ == "__main__":
    unittest.main()
