from maintenance.occ_service import run_occ_demo


def main():

    print("\nLaunching concurrent inventory writers...\n")

    result = run_occ_demo()

    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)

    print(result["summary"])

    for writer in result["writers"]:

        print("=" * 70)
        print(f"Writer {writer['writer_id']}")
        print("=" * 70)

        print(writer["stdout"])

        if writer["stderr"]:
            print(writer["stderr"])

        print(f"Exit Code: {writer['exit_code']}")

    print("\nRecent OCC Log")
    print("-" * 70)

    for conflict in result["conflicts"]:

        print(
            f"Writer={conflict['writer_id']} | "
            f"Outcome={conflict['outcome']} | "
            f"Time={conflict['attempted_at']} | "
            f"Error={conflict['error_type']}"
        )


if __name__ == "__main__":
    main()