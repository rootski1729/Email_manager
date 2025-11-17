#!/usr/bin/env python3
"""
Razorpay Integration Test Script
Tests all payment endpoints to ensure proper configuration
"""

import asyncio
import httpx
import json
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000/api/v1"
ACCESS_TOKEN = "your-test-jwt-token"  # Replace with real token

class PaymentTester:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.token = token
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    async def test_get_razorpay_key(self):
        """Test: Get Razorpay Key"""
        print("\n📋 TEST 1: Get Razorpay Key")
        print("-" * 50)
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/payments/razorpay-key"
                )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ SUCCESS")
                print(f"   Key ID: {data.get('key_id', 'N/A')[:20]}...")
                return True
            else:
                print(f"❌ FAILED - Status: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ ERROR: {e}")
            return False
    
    async def test_create_order_basic(self):
        """Test: Create Order for BASIC Plan"""
        print("\n📋 TEST 2: Create Order (BASIC Plan)")
        print("-" * 50)
        
        try:
            payload = {"plan_type": "basic"}
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/payments/create-order",
                    headers=self.headers,
                    json=payload
                )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ SUCCESS")
                print(f"   Order ID: {data.get('order_id')}")
                print(f"   Amount: ${data.get('amount')}")
                print(f"   Plan: {data.get('plan_name')}")
                print(f"   Email: {data.get('user_email')}")
                return data.get('order_id')
            else:
                print(f"❌ FAILED - Status: {response.status_code}")
                print(f"   Response: {response.text}")
                return None
        except Exception as e:
            print(f"❌ ERROR: {e}")
            return None
    
    async def test_create_order_pro(self):
        """Test: Create Order for PRO Plan"""
        print("\n📋 TEST 3: Create Order (PRO Plan)")
        print("-" * 50)
        
        try:
            payload = {"plan_type": "pro"}
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/payments/create-order",
                    headers=self.headers,
                    json=payload
                )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ SUCCESS")
                print(f"   Order ID: {data.get('order_id')}")
                print(f"   Amount: ${data.get('amount')}")
                print(f"   Plan: {data.get('plan_name')}")
                return data.get('order_id')
            else:
                print(f"❌ FAILED - Status: {response.status_code}")
                print(f"   Response: {response.text}")
                return None
        except Exception as e:
            print(f"❌ ERROR: {e}")
            return None
    
    async def test_create_order_free(self):
        """Test: Create Order for FREE Plan (Should Fail)"""
        print("\n📋 TEST 4: Create Order (FREE Plan - Should Fail)")
        print("-" * 50)
        
        try:
            payload = {"plan_type": "free"}
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/payments/create-order",
                    headers=self.headers,
                    json=payload
                )
            
            if response.status_code == 400:
                data = response.json()
                print(f"✅ EXPECTED FAILURE (This is correct)")
                print(f"   Reason: {data.get('detail')}")
                return True
            elif response.status_code == 200:
                print(f"❌ UNEXPECTED - Should have failed for FREE plan")
                return False
            else:
                print(f"❌ FAILED - Status: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ ERROR: {e}")
            return False
    
    async def test_activate_free_plan(self):
        """Test: Activate FREE Plan"""
        print("\n📋 TEST 5: Activate FREE Plan")
        print("-" * 50)
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/payments/activate-plan-free",
                    headers=self.headers
                )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ SUCCESS")
                print(f"   Message: {data.get('message')}")
                return True
            else:
                print(f"❌ FAILED - Status: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ ERROR: {e}")
            return False
    
    async def test_invalid_plan_type(self):
        """Test: Invalid Plan Type"""
        print("\n📋 TEST 6: Invalid Plan Type (Should Fail)")
        print("-" * 50)
        
        try:
            payload = {"plan_type": "invalid"}
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/payments/create-order",
                    headers=self.headers,
                    json=payload
                )
            
            if response.status_code != 200:
                print(f"✅ EXPECTED FAILURE")
                print(f"   Status: {response.status_code}")
                return True
            else:
                print(f"❌ UNEXPECTED - Should have failed")
                return False
        except Exception as e:
            print(f"❌ ERROR: {e}")
            return False
    
    async def test_unauthorized_access(self):
        """Test: Unauthorized Access (No Token)"""
        print("\n📋 TEST 7: Unauthorized Access (Should Fail)")
        print("-" * 50)
        
        try:
            payload = {"plan_type": "basic"}
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/payments/create-order",
                    headers={"Content-Type": "application/json"},
                    json=payload
                )
            
            if response.status_code == 401 or response.status_code == 403:
                print(f"✅ EXPECTED FAILURE (Auth required)")
                print(f"   Status: {response.status_code}")
                return True
            else:
                print(f"⚠️  Got status {response.status_code} - May not be strict auth")
                return False
        except Exception as e:
            print(f"❌ ERROR: {e}")
            return False
    
    async def run_all_tests(self):
        """Run all tests"""
        print("\n" + "="*50)
        print("🧪 RAZORPAY INTEGRATION TEST SUITE")
        print("="*50)
        print(f"Base URL: {self.base_url}")
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        results = []
        
        # Run tests
        results.append(("Get Razorpay Key", await self.test_get_razorpay_key()))
        results.append(("Create Order - BASIC", await self.test_create_order_basic() is not None))
        results.append(("Create Order - PRO", await self.test_create_order_pro() is not None))
        results.append(("Create Order - FREE (Should Fail)", await self.test_create_order_free()))
        results.append(("Activate FREE Plan", await self.test_activate_free_plan()))
        results.append(("Invalid Plan Type", await self.test_invalid_plan_type()))
        results.append(("Unauthorized Access", await self.test_unauthorized_access()))
        
        # Print summary
        print("\n" + "="*50)
        print("📊 TEST SUMMARY")
        print("="*50)
        
        passed = sum(1 for _, result in results if result)
        total = len(results)
        
        for test_name, result in results:
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{status}: {test_name}")
        
        print(f"\nTotal: {passed}/{total} tests passed")
        
        if passed == total:
            print("\n🎉 All tests passed! Razorpay integration is working correctly.")
        else:
            print(f"\n⚠️  {total - passed} tests failed. Please check the errors above.")
        
        return passed == total


async def main():
    """Main test runner"""
    
    # Configuration
    base_url = "http://localhost:8000/api/v1"
    
    # Get token from environment or input
    print("🔑 Razorpay Integration Test Setup")
    print("-" * 50)
    
    token = input("Enter your JWT access token (or press Enter for test token): ").strip()
    if not token:
        token = "test_token"  # For initial testing without auth
        print(f"⚠️  Using placeholder token: {token}")
    
    custom_url = input("Enter API base URL (default: http://localhost:8000/api/v1): ").strip()
    if custom_url:
        base_url = custom_url
    
    # Run tests
    tester = PaymentTester(base_url, token)
    success = await tester.run_all_tests()
    
    return 0 if success else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
