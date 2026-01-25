#!/usr/bin/env python3
"""
Helper script to get user UUID from the database
Run this to find your USER_UUID for the ESP simulator
"""

import subprocess
import sys

def get_user_uuids():
    """Query database for all users and their UUIDs"""
    try:
        # Run docker exec command to query PostgreSQL
        cmd = [
            "docker", "exec", "-it", "postgres",
            "psql", "-U", "mqtt_user", "-d", "mqtt_db",
            "-c", "SELECT uuid, username, created_at FROM users ORDER BY created_at DESC;"
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        
        if result.returncode == 0:
            print("=" * 70)
            print("Users in Database")
            print("=" * 70)
            print(result.stdout)
            print("=" * 70)
            print("\nCopy the UUID of your user and paste it into the simulator script.")
            print("Edit esp_device_simulator.py and set: USER_UUID = \"your-uuid-here\"")
            print("=" * 70)
        else:
            print(f"Error querying database: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        print("Error: Database query timed out")
        return False
    except FileNotFoundError:
        print("Error: Docker command not found. Is Docker installed and running?")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False
    
    return True

if __name__ == "__main__":
    print("\n📋 ESP Simulator - User UUID Finder\n")
    
    # Check if postgres container is running
    try:
        result = subprocess.run(
            ["docker", "ps", "--filter", "name=postgres", "--format", "{{.Names}}"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if "postgres" not in result.stdout:
            print("❌ PostgreSQL container is not running!")
            print("   Start it with: docker-compose up -d postgres")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Cannot check Docker status: {e}")
        sys.exit(1)
    
    # Get UUIDs
    success = get_user_uuids()
    
    if not success:
        print("\n💡 Alternative: Check backend logs when you login:")
        print("   docker logs backend | grep -i login")
        
    print()
