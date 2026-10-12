# Recursion for Year 12: A Lesson Sequence

Recursion is the topic in the A-level specification that I have seen produce the most confident wrong answers. Students learn to write a factorial function, trace it once, and then freeze when a recursive call does anything other than count down by one. This sequence is three lessons plus a homework, built around one rule: **trust the recursive call**. Everything else is practice at following that rule.

## Before the first lesson

Students should already be comfortable with functions that call other functions, and with the idea of a call stack from the "how programs run" topic. If they aren't, spend ten minutes on a non-recursive example first: `main` calls `area`, which calls `square`, and each call waits for the one it made to return.

## Lesson 1: the shape of a recursive function

Start without code. Ask: how would you count the people in a queue if you were standing in it and could only talk to the person behind you?

The usual answer emerges after a minute: ask the person behind you how many people are behind *them*, and add one. The last person in the queue has nobody behind them and says zero. That is recursion, with a base case.

Then the first function:

```python
def count_down(n):
    if n == 0:            # base case: stop
        print("Lift off")
        return
    print(n)
    count_down(n - 1)     # recursive case: a smaller problem
```

Every recursive function we write in this unit has the same two parts:

1. **A base case** that answers without recursing.
2. **A recursive case** that calls the function on a *smaller* problem and builds its answer from the result.

Have students trace `count_down(3)` on paper, drawing a box for each call. Then ask what happens if you delete the base case. Run it, and let them see `RecursionError: maximum recursion depth exceeded`. It is a better lesson than any explanation.

## Lesson 2: trusting the recursive call

This is the lesson that matters. Write `factorial` together:

```python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
```

Now ask: *how do you know `factorial(n - 1)` gives the right answer?* Students try to trace it all the way down, which works for 4 and is hopeless for 400.

The answer is the same as for a proof by induction. If the base case is right, and the recursive case is right *assuming the smaller call is right*, the whole function is right. You never trace the full chain. You check one level.

Practise this with problems where tracing is impractical:

```python
def sum_digits(n):
    """sum_digits(4096) == 4 + 0 + 9 + 6 == 19"""
    if n < 10:
        return n
    return n % 10 + sum_digits(n // 10)

def reverse(s):
    """reverse("stack") == "kcats" """
    if len(s) <= 1:
        return s
    return reverse(s[1:]) + s[0]
```

For each one, students write two sentences only: "The base case is right because…" and "If the smaller call is right, this returns the right answer because…". It feels odd at first. By the end of the lesson most of them can write `reverse` from scratch.

## Lesson 3: recursion on structures

Recursion earns its place on data that is itself recursive. A folder contains files and other folders; a tree node contains other trees.

```python
def total_size(folder):
    size = 0
    for item in folder.items:
        if item.is_file:
            size += item.size
        else:
            size += total_size(item)   # a folder is a smaller version of the problem
    return size
```

Writing this iteratively needs an explicit stack, which is a good extension task for the strongest students: it shows them that recursion was using a stack all along.

Then binary search, which is on the specification and often taught only iteratively:

```python
def binary_search(items, target, low, high):
    if low > high:
        return -1
    mid = (low + high) // 2
    if items[mid] == target:
        return mid
    if items[mid] < target:
        return binary_search(items, target, mid + 1, high)
    return binary_search(items, target, low, mid - 1)
```

## Misconceptions to watch for

| What students say | What's going on |
|---|---|
| "It goes down and then comes back up" | Correct, but they can't say *what* comes back up. Ask what each call returns. |
| "The base case is the last line" | They think of it as the end of the code rather than the end of the recursion. |
| "Recursion is faster" | Usually it is slower and uses more memory; it is chosen because it is clearer. |
| Forgetting to `return` the recursive call | The function computes the right value and then throws it away. This one causes the most lost marks. |

## Homework

1. Write `power(base, exp)` recursively. Then write a version that uses $x^{2k} = (x^k)^2$ to take far fewer steps, and count the calls each version makes for `exp = 64`.
2. Write `is_palindrome(s)` recursively.
3. Explain in your own words why the recursive Fibonacci function becomes so slow, and what you could do about it. You don't need to code the fix.

The third question previews memoisation, which comes back in the algorithms unit next term.
