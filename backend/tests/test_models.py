import unittest
from app import models

class PrototypeTests(unittest.TestCase):
    def test_temperature_viscosity_decreases(self):
        self.assertLess(models.viscosity_cp(100),models.viscosity_cp(20))
    def test_thermal_outputs_bounded_and_explicit(self):
        x=models.thermal_prediction('soak',48)
        self.assertEqual(len(x['radial']),48); self.assertIn('SIMULATED',x['status']); self.assertGreater(x['boundary_residual_c'],0)
    def test_dynacard_and_sampling(self):
        a=models.dynacard(100,False); b=models.dynacard(50,True)
        self.assertEqual(a['sample_hz'],100); self.assertFalse(a['anomaly']); self.assertTrue(b['anomaly']); self.assertGreater(len(a['downhole']),0)
    def test_fast_loop_limits_and_block(self):
        x=models.fast_mpc(); self.assertLessEqual(x['predicted_rod_load_kN'],x['rod_load_limit_kN'])
        y=models.fast_mpc(max_load=1); self.assertFalse(y['action_allowed'])
    def test_slow_loop_economics(self):
        x=models.slow_css(); self.assertEqual(len(x['scenarios']),12); self.assertIn('not audited profit',x['accounting'].lower())
    def test_demo_is_explicitly_synthetic(self):
        x=models.rod_floating_simulation(); self.assertIn('SIMULATED',x['label']); self.assertEqual(len(x['steps']),5)

if __name__=='__main__': unittest.main()
