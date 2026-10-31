import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")

import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402

import server  # noqa: E402,F401  (load server first to avoid circular import)
import pvp  # noqa: E402


def run_bots(game, n, max_steps=20000):
    m = {"game": game, "state": pvp.init_state(game, n)}
    for _ in range(max_steps):
        st = m["state"]
        if game == "callbreak" and st["phase"] == "hand_end":
            sc = [b * 10 + (t - b) if t >= b else -b * 10 for b, t in zip(st["bids"], st["tricks"])]
            assert sum(st["tricks"]) == 13
            return m, sc
        if game == "break10" and st["phase"] == "hand_end":
            return m, st["points"]
        if game == "ludo" and st["phase"] == "done":
            return m, st["finished"]
        seat = st["turn"]
        pvp.apply_action(m, seat, pvp.bot_action(m, seat))
    raise AssertionError("game did not finish")


def test_deal_52_unique():
    hands = pvp.deal4()
    cards = [tuple(c) for h in hands for c in h]
    assert len(cards) == 52 and len(set(cards)) == 52 and all(len(h) == 13 for h in hands)


def test_callbreak_full_hand_and_scoring():
    m, sc = run_bots("callbreak", 4)
    assert len(sc) == 4
    assert all(len(h) == 0 for h in m["state"]["hands"])


def test_callbreak_trick_winner_trump():
    trick = [[0, [8, "H"]], [1, [12, "H"]], [2, [4, "H"]], [3, [2, "S"]]]
    assert pvp.trick_winner(trick, "S") == 3


def test_callbreak_must_follow_and_trump():
    hand = [[5, "H"], [3, "S"], [9, "C"]]
    assert pvp.cb_legal(hand, [[0, [8, "H"]]]) == [[5, "H"]]
    assert pvp.cb_legal([[3, "S"], [9, "C"]], [[0, [8, "H"]]]) == [[3, "S"]]


def test_callbreak_illegal_card_rejected():
    m = {"game": "callbreak", "state": pvp.init_state("callbreak", 4)}
    st = m["state"]
    for s in range(4):
        pvp.apply_action(m, st["turn"], {"bid": 2})
    seat = st["turn"]
    other = (seat + 1) % 4
    with pytest.raises(HTTPException):
        pvp.apply_action(m, other, {"rank": st["hands"][other][0][0], "suit": st["hands"][other][0][1]})


def test_break10_scoring_ownership():
    m, pts = run_bots("break10", 4)
    st = m["state"]
    assert sum(pts) <= 4 and len(st["history"]) == 13
    exp = [0, 0]
    for t in st["history"]:
        wt = t["winner"] % 2
        for _, c in t["cards"]:
            if c[0] == 10 and st["owner10"][f"10{c[1]}"] % 2 != wt:
                exp[wt] += 1
    assert exp == pts


def test_break10_sequence_validation():
    hand = [[14, "S"], [13, "S"], [12, "S"], [5, "H"]]
    assert pvp.valid_sequence(hand, "S", 3, 14)
    assert not pvp.valid_sequence(hand, "S", 4, 14)
    assert pvp.best_sequence(hand)[:2] == (3, 14)


@pytest.mark.parametrize("n", [2, 3, 4])
def test_ludo_modes_finish(n):
    m, fin = run_bots("ludo", n, 100000)
    assert len(fin) == 1
    col = m["state"]["colors"][fin[0]]
    assert all(p == pvp.HOME for p in m["state"]["tokens"][col])


def test_ludo_needs_six_to_open():
    st = pvp.init_state("ludo", 2)
    assert pvp.ludo_moves(st, 0, 5) == []
    assert pvp.ludo_moves(st, 0, 6) == [0, 1, 2, 3]
