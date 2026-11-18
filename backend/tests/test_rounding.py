import pytest

from app.rounding import calculate_roundup

R = 100  # paise per rupee


@pytest.mark.parametrize(
    "rupees,inc,rounded,saved",
    [
        (75, 10, 80, 5),
        (142, 10, 150, 8),
        (299, 10, 300, 1),
        (1245, 50, 1250, 5),
        (142, 100, 200, 58),
        (101, 50, 150, 49),
    ],
)
def test_roundup_examples(rupees, inc, rounded, saved):
    assert calculate_roundup(rupees * R, inc * R) == (rounded * R, saved * R)


@pytest.mark.parametrize("rupees,inc", [(950, 10), (950, 50), (1000, 100), (80, 10), (50, 50)])
def test_already_rounded_amounts_save_nothing(rupees, inc):
    assert calculate_roundup(rupees * R, inc * R) == (rupees * R, 0)


def test_paise_precision():
    # Rs 75.50 with Rs 10 increment -> Rs 80, saves Rs 4.50 exactly (no float error)
    assert calculate_roundup(7550, 1000) == (8000, 450)


@pytest.mark.parametrize("amount,inc", [(0, 1000), (-5, 1000), (100, 0)])
def test_invalid_inputs(amount, inc):
    with pytest.raises(ValueError):
        calculate_roundup(amount, inc)
