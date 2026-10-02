"""Pure-logic tests for the two-person rule helpers (no database required).

Run from the ``backend`` directory:  python -m unittest tests.test_command_rules
"""

import unittest

from backend.services.command_engine import _same_person


class SamePersonTests(unittest.TestCase):
    def test_exact_match(self):
        self.assertTrue(_same_person("aditya singh", "aditya singh"))

    def test_case_and_whitespace_do_not_make_two_people(self):
        self.assertTrue(_same_person("Aditya  Singh", " aditya singh "))

    def test_different_people(self):
        self.assertFalse(_same_person("Aditya Singh", "Dr. Meera Nair"))

    def test_empty_names_never_match(self):
        self.assertFalse(_same_person("", ""))
        self.assertFalse(_same_person(None, None))


if __name__ == "__main__":
    unittest.main()
