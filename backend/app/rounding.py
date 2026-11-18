"""Round-up logic. All money is integer paise (1 rupee = 100 paise), so there are no float errors."""


def calculate_roundup(amount_paise: int, increment_paise: int) -> tuple[int, int]:
    """Return (rounded_amount_paise, savings_paise).

    The amount is rounded UP to the next multiple of the increment.
    If it already is a multiple, nothing is saved (savings == 0).

    Examples with a Rs 10 increment:  75 -> 80 (save 5),  142 -> 150 (save 8),  299 -> 300 (save 1).
    """
    if amount_paise <= 0:
        raise ValueError("amount must be positive")
    if increment_paise <= 0:
        raise ValueError("increment must be positive")
    remainder = amount_paise % increment_paise
    if remainder == 0:
        return amount_paise, 0
    savings = increment_paise - remainder
    return amount_paise + savings, savings
