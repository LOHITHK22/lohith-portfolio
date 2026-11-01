// The four Data Quality Detective cases. Each answer is judged by running `accepted` reference
// queries against the same disposable database and comparing result sets (see compare.ts).
// `accepted` keeps only the columns an answer must contain; `solution` is the fuller query shown
// to visitors who ask for it.

export type Challenge = {
  id: string;
  number: number;
  title: string;
  dataset: "Shipping operations" | "Payment reconciliation";
  concepts: string[];
  problem: string;
  task: string;
  mustInclude: string;
  starter: string;
  hints: string[];
  solution: string;
  accepted: string[];
  why: string;
  outcome: string;
};

export const CHALLENGES: Challenge[] = [
  {
    id: "duplicates",
    number: 1,
    title: "The double-charged customers",
    dataset: "Payment reconciliation",
    concepts: ["GROUP BY", "COUNT", "HAVING"],
    problem:
      "Support tickets say some customers were charged twice. The processor feed was replayed during an outage, and the transactions table has no unique key, so the same transaction may have been loaded more than once.",
    task: "Find every txn_id that appears in transactions more than once.",
    mustInclude: "txn_id (a count of copies is a nice extra)",
    starter: "SELECT txn_id\nFROM transactions\nLIMIT 10;",
    hints: [
      "Group the rows so each txn_id becomes one group, then count the rows in each group.",
      "WHERE filters rows before grouping. To filter on COUNT(*), use HAVING after GROUP BY.",
    ],
    solution: "SELECT txn_id, COUNT(*) AS copies\nFROM transactions\nGROUP BY txn_id\nHAVING COUNT(*) > 1\nORDER BY copies DESC;",
    accepted: ["SELECT txn_id FROM transactions GROUP BY txn_id HAVING COUNT(*) > 1"],
    why: "GROUP BY collapses rows that share a txn_id, COUNT(*) measures each group, and HAVING keeps only the groups with more than one row. A transaction ID should be unique, so any group larger than one is a duplicate load.",
    outcome:
      "Four transactions were ingested more than once, one of them three times. Before refunding anyone, the team de-duplicates the feed and adds a uniqueness check on txn_id so a replay can't double-count revenue again.",
  },
  {
    id: "missing-shipments",
    number: 2,
    title: "The orders that never left",
    dataset: "Shipping operations",
    concepts: ["LEFT JOIN", "IS NULL", "anti-join"],
    problem:
      "Customers are asking where their orders are. Every paid order should have at least one shipment record from a carrier, but the warehouse integration dropped some messages.",
    task: "List the orders that have no matching row in shipments.",
    mustInclude: "order_id",
    starter: "SELECT o.order_id, s.shipment_id\nFROM orders o\nLEFT JOIN shipments s ON s.order_id = o.order_id\nLIMIT 10;",
    hints: [
      "An INNER JOIN only keeps orders that have a shipment. A LEFT JOIN keeps every order and fills the shipment columns with NULL when there's no match.",
      "After a LEFT JOIN, filter on a shipment column that is never NULL in real shipments, such as s.shipment_id IS NULL. (NOT EXISTS works too.)",
    ],
    solution:
      "SELECT o.order_id, o.warehouse_id, o.order_date\nFROM orders o\nLEFT JOIN shipments s ON s.order_id = o.order_id\nWHERE s.shipment_id IS NULL\nORDER BY o.order_id;",
    accepted: ["SELECT order_id FROM orders WHERE NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = orders.order_id)"],
    why: "The LEFT JOIN keeps every order. Orders without a shipment get NULL in every shipment column, so filtering on s.shipment_id IS NULL leaves exactly the unmatched orders. This pattern is called an anti-join. Filtering on s.status would be wrong: some real shipments have a missing status.",
    outcome:
      "Five orders have no shipment at all. They are re-queued for fulfilment, and a daily reconciliation check now alerts when an order is older than 48 hours without a shipment. Three shipments with a missing status are a separate data-quality ticket.",
  },
  {
    id: "reconcile",
    number: 3,
    title: "The money that doesn't add up",
    dataset: "Payment reconciliation",
    concepts: ["INNER JOIN", "comparison", "DISTINCT"],
    problem:
      "Finance closed the month and the settled total is lower than the captured total. Each settlement should pay exactly the transaction amount, so something was short-paid or over-paid.",
    task: "Find the transactions whose settled_amount differs from the transaction amount.",
    mustInclude: "txn_id (the two amounts and the difference make it useful)",
    starter: "SELECT t.txn_id, t.amount, s.settled_amount\nFROM transactions t\nJOIN settlements s ON s.txn_id = t.txn_id\nLIMIT 10;",
    hints: [
      "Join transactions to settlements on txn_id, then compare the two amount columns.",
      "Keep the rows where t.amount <> s.settled_amount. Duplicate transaction rows can repeat a result; SELECT DISTINCT tidies that up.",
    ],
    solution:
      "SELECT DISTINCT t.txn_id, t.merchant_id,\n       t.amount AS expected_amount,\n       s.settled_amount,\n       ROUND(s.settled_amount - t.amount, 2) AS difference\nFROM transactions t\nJOIN settlements s ON s.txn_id = t.txn_id\nWHERE t.amount <> s.settled_amount\nORDER BY difference;",
    accepted: ["SELECT t.txn_id FROM transactions t JOIN settlements s ON s.txn_id = t.txn_id WHERE t.amount <> s.settled_amount"],
    why: "The INNER JOIN pairs each transaction with its settlement, so only settled transactions are compared. The WHERE clause keeps pairs whose amounts disagree. Unsettled transactions are a different problem and correctly drop out of the join.",
    outcome:
      "Four settlements are wrong: a small fee deduction, a partial settlement, an over-payment and a short payment. Each becomes a dispute with the acquirer, with the exact difference attached.",
  },
  {
    id: "report",
    number: 4,
    title: "The merchant settlement report",
    dataset: "Payment reconciliation",
    concepts: ["CTE", "aggregates", "conditional count", "dates"],
    problem:
      "Leadership wants a per-merchant settlement report before the next payout: how many settlements each merchant received, how much was paid, and how many settlements arrived more than 2 days after the transaction. Remember case 1: the transactions table contains duplicates.",
    task:
      "For each merchant, return the merchant (name or ID), the number of settlements, the total settled amount, and the number of settlements whose settlement_date is more than 2 days after the transaction's txn_date.",
    mustInclude: "merchant, settlement count, total settled, delayed count",
    starter:
      "SELECT s.merchant_id, s.settlement_id, s.settled_amount,\n       s.settlement_date, t.txn_date\nFROM settlements s\nJOIN transactions t ON t.txn_id = s.txn_id\nLIMIT 10;",
    hints: [
      "Settlement dates live in settlements and transaction dates in transactions. julianday(a) - julianday(b) gives the gap in days.",
      "Joining straight to transactions repeats the duplicated rows from case 1 and inflates counts and totals. De-duplicate first, for example WITH txn AS (SELECT DISTINCT txn_id, txn_date FROM transactions).",
      "Count delayed settlements with SUM(CASE WHEN … > 2 THEN 1 ELSE 0 END) so merchants with none still show 0.",
    ],
    solution:
      "WITH txn AS (\n  SELECT DISTINCT txn_id, txn_date FROM transactions\n)\nSELECT m.name AS merchant,\n       COUNT(*) AS settlements,\n       ROUND(SUM(s.settled_amount), 2) AS total_settled,\n       SUM(CASE WHEN julianday(s.settlement_date) - julianday(t.txn_date) > 2\n                THEN 1 ELSE 0 END) AS delayed_settlements\nFROM settlements s\nJOIN txn t ON t.txn_id = s.txn_id\nJOIN merchants m ON m.merchant_id = s.merchant_id\nGROUP BY m.name\nORDER BY total_settled DESC;",
    accepted: [
      "WITH txn AS (SELECT DISTINCT txn_id, txn_date FROM transactions) SELECT m.name, COUNT(*), SUM(s.settled_amount), SUM(julianday(s.settlement_date) - julianday(t.txn_date) > 2) FROM settlements s JOIN txn t ON t.txn_id = s.txn_id JOIN merchants m ON m.merchant_id = s.merchant_id GROUP BY m.name",
      "WITH txn AS (SELECT DISTINCT txn_id, txn_date FROM transactions) SELECT s.merchant_id, COUNT(*), SUM(s.settled_amount), SUM(julianday(s.settlement_date) - julianday(t.txn_date) > 2) FROM settlements s JOIN txn t ON t.txn_id = s.txn_id GROUP BY s.merchant_id",
    ],
    why: "The CTE removes the duplicate transaction rows before the join, so each settlement is counted once. COUNT and SUM aggregate per merchant, and the CASE expression turns 'more than 2 days late' into a 1 or 0 that can be summed, which keeps merchants with no delays in the report.",
    outcome:
      "Every merchant appears with accurate counts and totals, and the report shows which merchants are waiting longest for their money. Without the de-duplication step, three merchants would show inflated counts and totals, and two of them would look later than they really were.",
  },
];
