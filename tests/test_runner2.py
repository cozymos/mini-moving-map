import subprocess
import sys


def run_python(script_path):
    print(f"🤖 Running: {script_path}")
    result = subprocess.run([sys.executable, script_path], check=True)
    print(f"🎉 Finished: {script_path} (exit code = {result.returncode})\n")
    if result.returncode == 1:
        sys.exit(1)


run_python("tests/test_runner1.py")
run_python("tests/test_core_func.py")
run_python("tests/test_api_endpt.py")
