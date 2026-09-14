# Flows

## The one that matters

```mermaid
sequenceDiagram
    actor K as Keeper
    actor P as Players
    participant App
    participant W as Worker

    K->>App: new session: 5–19 October, six hours minimum, quorum 3
    K->>App: invite the campaign; mark Anna required
    K->>App: publish
    App->>P: "When are you free for Chapter Two?" (in-app, email, channel)

    P->>App: answer, one evening at a time
    Note over P: aggregate visible: "Thursday — 4 of 5 · quorum met"<br/>names never

    W->>App: 36h before the deadline: remind whoever has not answered
    W->>App: deadline passes → close, rank, tell the Keeper

    K->>App: read the ranking
    Note over K: 1. Thu 8 Oct 18:00–24:00 — 91.67%<br/>   Everyone required is free · 1 has not answered
    K->>App: choose it
    App->>P: "Chapter Two is confirmed" + calendar attachment
```

## Getting an account

There is no sign-up. An administrator creates the account and hands the
activation link over out of band. The application deliberately does not email
it: accounts are created a few times a year, and a channel outside the system is
more reliable than a home relay for the one message that grants access.

The link works once, expires in seven days, and its plaintext exists only in the
administrator's clipboard.

## Joining a campaign

Two kinds of invitation. A **personal** one names a user, works once, and
notifies them. A **shared link** has a use count and is handed out by the Keeper
however they like.

Both are for **existing accounts only**. Someone without one is told to ask the
administrator, rather than being offered a sign-up that does not exist.

Rejoining reactivates the original membership row, so the history of somebody
who left and came back is not two people.

## Answering

Open the session, see a calendar of evenings. One press answers; a second
changes how firm it is; a third refuses; a fourth clears it. A clock button on
each date opens that evening's hours for anybody who starts late or leaves
early. Presets fill a week at a time and "same as last time" maps a previous
answer onto this window's weekdays.

Nothing autosaves, and the Save button says whether there is anything unsaved.

## When no date works

The Keeper sees which windows were rejected and why, who ruled out how many, how
close the best one came to quorum, and four things that could change. That
screen is the difference between this and a poll.

## When a campaign goes quiet

The dashboard's largest element becomes a warning that nothing is planned, with
the button that fixes it, and the Keeper is told once a week. Campaigns do not
usually end in an argument — they end here.
