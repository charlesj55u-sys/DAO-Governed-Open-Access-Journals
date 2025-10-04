(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PROPOSAL-DURATION u101)
(define-constant ERR-INVALID-QUORUM-THRESHOLD u102)
(define-constant ERR-INVALID-MAJORITY_THRESHOLD u103)
(define-constant ERR-INVALID-PROPOSAL-TYPE u104)
(define-constant ERR-PROPOSAL-ALREADY-EXISTS u105)
(define-constant ERR-PROPOSAL-NOT-FOUND u106)
(define-constant ERR-VOTING-CLOSED u107)
(define-constant ERR-INSUFFICIENT-TOKENS u108)
(define-constant ERR-ALREADY-VOTED u109)
(define-constant ERR-PROPOSAL_NOT_ACTIVE u110)
(define-constant ERR-EXECUTION_FAILED u111)
(define-constant ERR-INVALID-TIMELOCK u112)
(define-constant ERR-PROPOSAL_EXPIRED u113)
(define-constant ERR-INVALID_TARGET_CONTRACT u114)
(define-constant ERR-INVALID_PARAM u115)
(define-constant ERR-MAX_PROPOSALS_EXCEEDED u116)
(define-constant ERR-INVALID_START_DELAY u117)
(define-constant ERR-INVALID_VOTE_WEIGHT u118)
(define-constant ERR-NOT-TOKEN-HOLDER u119)
(define-constant ERR-INVALID_DESCRIPTION_LENGTH u120)

(define-data-var next-proposal-id uint u0)
(define-data-var max-proposals uint u1000)
(define-data-var proposal-duration uint u144)
(define-data-var quorum-threshold uint u10)
(define-data-var majority-threshold uint u51)
(define-data-var timelock-duration uint u72)
(define-data-var token-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var treasury-contract (optional principal) none)

(define-map proposals
  uint
  {
    creator: principal,
    start-block: uint,
    end-block: uint,
    proposal-type: (string-ascii 50),
    target-contract: (optional principal),
    function-name: (optional (string-ascii 50)),
    param: (optional (buff 1024)),
    description: (string-utf8 500),
    for-votes: uint,
    against-votes: uint,
    executed: bool,
    timelock-end: uint
  }
)

(define-map votes
  { proposal-id: uint, voter: principal }
  { weight: uint, voted-for: bool }
)

(define-map proposal-count-by-type
  (string-ascii 50)
  uint)

(define-read-only (get-proposal (id uint))
  (map-get? proposals id)
)

(define-read-only (get-vote (id uint) (voter principal))
  (map-get? votes { proposal-id: id, voter: voter })
)

(define-read-only (get-proposal-count-by-type (ptype (string-ascii 50)))
  (default-to u0 (map-get? proposal-count-by-type ptype))
)

(define-private (validate-proposal-duration (duration uint))
  (if (and (> duration u0) (<= duration u1008))
    (ok true)
    (err ERR-INVALID-PROPOSAL-DURATION))
)

(define-private (validate-quorum-threshold (threshold uint))
  (if (and (>= threshold u5) (<= threshold u50))
    (ok true)
    (err ERR-INVALID_QUORUM-THRESHOLD))
)

(define-private (validate-majority-threshold (threshold uint))
  (if (and (> threshold u50) (<= threshold u100))
    (ok true)
    (err ERR-INVALID_MAJORITY_THRESHOLD))
)

(define-private (validate-proposal-type (ptype (string-ascii 50)))
  (if (or (is-eq ptype "policy") (is-eq ptype "upgrade") (is-eq ptype "fund") (is-eq ptype "journal"))
    (ok true)
    (err ERR-INVALID_PROPOSAL_TYPE))
)

(define-private (validate-timelock-duration (duration uint))
  (if (and (>= duration u24) (<= duration u720))
    (ok true)
    (err ERR-INVALID-TIMELOCK))
)

(define-private (validate-target-contract (target (optional principal)))
  (match target t
    (if (not (is-eq t tx-sender))
      (ok true)
      (err ERR-INVALID_TARGET_CONTRACT))
    (ok true))
)

(define-private (validate-param (param (optional (buff 1024))))
  (match param p
    (if (<= (len p) u1024)
      (ok true)
      (err ERR-INVALID_PARAM))
    (ok true))
)

(define-private (validate-description (desc (string-utf8 500)))
  (if (and (> (len desc) u0) (<= (len desc) u500))
    (ok true)
    (err ERR-INVALID_DESCRIPTION_LENGTH))
)

(define-private (validate-start-delay (delay uint))
  (if (<= delay u144)
    (ok true)
    (err ERR-INVALID_START_DELAY))
)

(define-private (calculate-quadratic-weight (tokens uint))
  (let ((sqrt (unwrap-panic (pow tokens u2))))
    (/ sqrt u100))
)

(define-private (has-sufficient-tokens (voter principal) (required uint))
  (let ((balance (unwrap-panic (contract-call? .token-contract get-balance voter))))
    (if (>= balance required)
      (ok true)
      (err ERR-INSUFFICIENT_TOKENS)))
)

(define-public (set-token-contract (new-token principal))
  (begin
    (asserts! (is-eq tx-sender (as-contract tx-sender)) (err ERR-NOT-AUTHORIZED))
    (var-set token-contract new-token)
    (ok true)
  )
)

(define-public (set-treasury-contract (new-treasury principal))
  (begin
    (asserts! (is-eq tx-sender (as-contract tx-sender)) (err ERR-NOT-AUTHORIZED))
    (var-set treasury-contract (some new-treasury))
    (ok true)
  )
)

(define-public (set-proposal-duration (new-duration uint))
  (begin
    (asserts! (is-eq tx-sender (as-contract tx-sender)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-proposal-duration new-duration))
    (var-set proposal-duration new-duration)
    (ok true)
  )
)

(define-public (set-quorum-threshold (new-threshold uint))
  (begin
    (asserts! (is-eq tx-sender (as-contract tx-sender)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-quorum-threshold new-threshold))
    (var-set quorum-threshold new-threshold)
    (ok true)
  )
)

(define-public (set-majority-threshold (new-threshold uint))
  (begin
    (asserts! (is-eq tx-sender (as-contract tx-sender)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-majority-threshold new-threshold))
    (var-set majority-threshold new-threshold)
    (ok true)
  )
)

(define-public (set-timelock-duration (new-duration uint))
  (begin
    (asserts! (is-eq tx-sender (as-contract tx-sender)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-timelock-duration new-duration))
    (var-set timelock-duration new-duration)
    (ok true)
  )
)

(define-public (create-proposal
  (ptype (string-ascii 50))
  (target (optional principal))
  (fname (optional (string-ascii 50)))
  (param (optional (buff 1024)))
  (desc (string-utf8 500))
  (start-delay uint)
)
  (let (
    (next-id (var-get next-proposal-id))
    (start-block (+ block-height start-delay))
    (end-block (+ start-block (var-get proposal-duration)))
    (total-supply (unwrap-panic (contract-call? .token-contract get-total-supply)))
    (min-tokens (/ total-supply u100))
  )
    (asserts! (< next-id (var-get max-proposals)) (err ERR-MAX_PROPOSALS_EXCEEDED))
    (try! (validate-proposal-type ptype))
    (try! (validate-target-contract target))
    (try! (validate-param param))
    (try! (validate-description desc))
    (try! (validate-start-delay start-delay))
    (try! (has-sufficient-tokens tx-sender min-tokens))
    (map-set proposals next-id
      {
        creator: tx-sender,
        start-block: start-block,
        end-block: end-block,
        proposal-type: ptype,
        target-contract: target,
        function-name: fname,
        param: param,
        description: desc,
        for-votes: u0,
        against-votes: u0,
        executed: false,
        timelock-end: u0
      }
    )
    (map-set proposal-count-by-type ptype (+ (get-proposal-count-by-type ptype) u1))
    (var-set next-proposal-id (+ next-id u1))
    (print { event: "proposal-created", id: next-id })
    (ok next-id)
  )
)

(define-public (vote-on-proposal (id uint) (vote-for bool))
  (let (
    (proposal (unwrap! (map-get? proposals id) (err ERR-PROPOSAL_NOT_FOUND)))
    (balance (unwrap-panic (contract-call? .token-contract get-balance tx-sender)))
    (weight (calculate-quadratic-weight balance))
  )
    (asserts! (>= block-height (get start-block proposal)) (err ERR-PROPOSAL_NOT_ACTIVE))
    (asserts! (< block-height (get end-block proposal)) (err ERR_VOTING_CLOSED))
    (asserts! (is-none (map-get? votes { proposal-id: id, voter: tx-sender })) (err ERR_ALREADY_VOTED))
    (asserts! (> balance u0) (err ERR_NOT_TOKEN_HOLDER))
    (map-set votes { proposal-id: id, voter: tx-sender } { weight: weight, voted-for: vote-for })
    (if vote-for
      (map-set proposals id (merge proposal { for-votes: (+ (get for-votes proposal) weight) }))
      (map-set proposals id (merge proposal { against-votes: (+ (get against-votes proposal) weight) }))
    )
    (print { event: "vote-cast", id: id, voter: tx-sender, for: vote-for, weight: weight })
    (ok true)
  )
)

(define-public (execute-proposal (id uint))
  (let (
    (proposal (unwrap! (map-get? proposals id) (err ERR_PROPOSAL_NOT_FOUND)))
    (total-votes (+ (get for-votes proposal) (get against-votes proposal)))
    (total-supply (unwrap-panic (contract-call? .token-contract get-total-supply)))
    (quorum (/ (* total-supply (var-get quorum-threshold)) u100))
    (majority (/ (* (get for-votes proposal) u100) total-votes))
    (timelock-end (+ (get end-block proposal) (var-get timelock-duration)))
  )
    (asserts! (>= block-height (get end-block proposal)) (err ERR_VOTING_CLOSED))
    (asserts! (not (get executed proposal)) (err ERR_ALREADY_VOTED))
    (asserts! (>= total-votes quorum) (err ERR_INVALID_QUORUM_THRESHOLD))
    (asserts! (>= majority (var-get majority-threshold)) (err ERR_INVALID_MAJORITY_THRESHOLD))
    (if (>= block-height timelock-end)
      (let (
        (target (unwrap! (get target-contract proposal) (err ERR_INVALID_TARGET_CONTRACT)))
        (fname (unwrap! (get function-name proposal) (err ERR_INVALID_PARAM)))
        (param (default-to 0x (get param proposal)))
      )
        (match (as-contract (contract-call? target fname param))
          success (begin
            (map-set proposals id (merge proposal { executed: true }))
            (print { event: "proposal-executed", id: id })
            (ok true))
          failure (err ERR_EXECUTION_FAILED))
      )
      (begin
        (map-set proposals id (merge proposal { timelock-end: timelock-end }))
        (ok false)
      )
    )
  )
)

(define-public (get-active-proposals)
  (filter (lambda (id) (is-some (get-proposal id))) (range u0 (var-get next-proposal-id)))
)

(define-private (range (start uint) (end uint))
  (if (< start end)
    (cons start (range (+ start u1) end))
    (list)
  )
)