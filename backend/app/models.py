"""Pure-Python, explicitly synthetic well-to-surface prototype models."""
from __future__ import annotations
import math, time

def clamp(x, lo, hi): return max(lo, min(hi, x))

def viscosity_cp(temp_c: float, reference_cp: float = 5000.0, reference_c: float = 20.0, beta: float = 0.045) -> float:
    """Illustrative exponential heavy-oil correlation: mu=mu_ref exp[-beta(T-Tref)].
    beta is a configurable sensitivity (1/C), not a Baghewala calibration.
    """
    return reference_cp * math.exp(-beta * (temp_c-reference_c))

def thermal_prediction(phase="injection", hours=24, steam_c=240, radius_m=20, points=48):
    """Reduced radial diffusion response; nondimensional diffusivity and boundary forcing are illustrative."""
    start=time.perf_counter(); phase=phase if phase in ("injection","soak","production") else "injection"
    base=35.0; amplitude={"injection":115.0,"soak":88.0,"production":58.0}[phase] * clamp((steam_c-35)/205,0.2,1.2)
    decay={"injection":0.002,"soak":0.0035,"production":0.009}[phase]
    radial=[]
    for i in range(points):
        r=0.15+(radius_m-0.15)*i/(points-1)
        t=base+amplitude*math.exp(-decay*hours)*math.exp(-r/(2.5+0.3*math.sqrt(max(hours,0))))
        radial.append({"radius_m":round(r,2),"temperature_c":round(t,2),"viscosity_cp":round(viscosity_cp(t),1)})
    depth=[{"depth_m":d,"temperature_c":round(base+amplitude*math.exp(-decay*hours)*math.exp(-d/180),2)} for d in range(0,1001,50)]
    # Finite-difference heat-equation diagnostic on a smooth illustrative field; not a trained PINN residual.
    residual=0.0
    for i in range(1,len(radial)-1):
        dr=radial[i+1]["radius_m"]-radial[i]["radius_m"]
        residual=max(residual,abs((radial[i+1]["temperature_c"]-2*radial[i]["temperature_c"]+radial[i-1]["temperature_c"])/(dr*dr)))
    return {"status":"SIMULATED — reduced-order analytical field; PINN training unavailable","phase":phase,"elapsed_hours":hours,"radial":radial,"depth":depth,"temperature_c":radial[0]["temperature_c"],"viscosity_cp":radial[0]["viscosity_cp"],"physics_residual_proxy":round(residual,4),"boundary_residual_c":round(abs(radial[-1]["temperature_c"]-base),2),"initial_condition":"35 °C uniform synthetic initial state","assumptions":"Axisymmetric, homogeneous formation; fixed illustrative diffusivity/boundary; no pressure coupling or latent heat.","compute_ms":round((time.perf_counter()-start)*1000,3)}

def dynacard(sample_hz=50, anomaly=False, samples=240):
    start=time.perf_counter(); n=max(24,min(int(samples),2000)); hz=clamp(int(sample_hz),1,200)
    surface=[]; downhole=[]; maxload=0.; minload=1e9
    for i in range(n):
        p=2*math.pi*i/n; pos=50+45*math.cos(p)
        load=950+330*math.sin(p+0.35)+100*math.sin(2*p)
        if anomaly: load += 290*math.exp(-((p-2.35)/0.38)**2)-210*math.exp(-((p-4.9)/0.45)**2)
        # Simplified damped-wave transfer: attenuate/phase-shift dominant components.
        dload=860+265*math.sin(p+0.62)+65*math.sin(2*p+0.3)
        if anomaly: dload += 220*math.exp(-((p-2.65)/0.43)**2)-180*math.exp(-((p-5.05)/0.48)**2)
        maxload=max(maxload,load); minload=min(minload,dload)
        surface.append({"position_mm":round(pos,2),"load_kN":round(load,2)})
        downhole.append({"position_mm":round(pos,2),"load_kN":round(dload,2)})
    latency=(time.perf_counter()-start)*1000
    return {"surface":surface,"downhole":downhole,"sample_hz":hz,"samples":n,"pump_fillage_pct":round(clamp(82-(17 if anomaly else 0),0,100),1),"maximum_surface_load_kN":round(maxload,1),"minimum_downhole_load_kN":round(minload,1),"rod_risk":"POTENTIAL ROD FLOATING — synthetic scenario" if anomaly else "Normal — simulated baseline","anomaly":bool(anomaly),"processing_ms":round(latency,3),"latency_note":"Measured local prototype computation; excludes transport and hardware acquisition.","wave_model":"Simplified 1-D damped wave proxy; effective wave speed and damping are not field-calibrated."}

def fast_mpc(fillage=82,spm=6.0,vfd=35.0,max_load=1800,max_spm=10,min_vfd=20,max_vfd=60,target_low=75,target_high=85,rod_risk=False):
    candidates=[]
    for s in [round(x*0.5,1) for x in range(2,int(max_spm*2)+1)]:
        if s>max_spm: continue
        predicted=clamp(fillage+(s-spm)*2.6,0,100)
        load=900+32*s+(190 if rod_risk else 0)
        risk=load/max_load
        cost=abs(predicted-(target_low+target_high)/2)+35*max(0,risk-0.82)+1.8*abs(s-spm)
        if load<=max_load: candidates.append((cost,s,predicted,load))
    if not candidates: return {"status":"BLOCKED: no candidate satisfies configured rod-load limit","action_allowed":False,"recommended_spm":spm}
    _,s,f,l=min(candidates)
    vf=clamp(vfd+(s-spm)*2.4,min_vfd,max_vfd)
    return {"status":"SIMULATED MPC — constrained candidate search","action_allowed":True,"recommended_spm":s,"recommended_vfd_hz":round(vf,1),"predicted_fillage_pct":round(f,1),"predicted_rod_load_kN":round(l,1),"rod_load_limit_kN":max_load,"explanation":"Selected lowest-cost feasible candidate; no real equipment command is issued.","candidates_evaluated":len(candidates)}

def slow_css(steam_cost=12,oil_price=65,electricity_cost=0.12,base_oil=24,energy_kwh=420,phase="production"):
    scenarios=[]
    for steam in [250,350,450,550]:
      for soak in [24,48,72]:
        thermal=thermal_prediction("injection",soak,points=12)
        production=base_oil*(1+0.002*(thermal["temperature_c"]-35))*(0.82+0.18*(steam/450))
        oil_revenue=production*oil_price
        steam_expense=steam*steam_cost
        power_expense=energy_kwh*electricity_cost
        revenue=oil_revenue-steam_expense-power_expense
        scenarios.append({"steam_volume_t":steam,"soak_hours":soak,"forecast_oil_bbl_day":round(production,2),"oil_revenue_per_day":round(oil_revenue,2),"steam_cost_per_cycle":round(steam_expense,2),"electricity_cost_per_day":round(power_expense,2),"modeled_net_value_per_day":round(revenue,2),"sor":round(steam/max(production,0.01),2)})
    best=max(scenarios,key=lambda x:x["modeled_net_value_per_day"])
    return {"status":"SIMULATED economic scenario — assumptions are editable; not a field forecast","best":best,"scenarios":scenarios,"recommendation":"Review this candidate with an engineer; no cycle is scheduled.","accounting":"Modeled value = gross oil revenue minus stated steam and electricity costs; excludes other operating costs, timing, taxes, royalties, and capital. It is not audited profit."}

def rod_floating_simulation():
    return {"label":"SIMULATED DEMONSTRATION — not an equipment fault prediction","steps":[{"phase":"Normal operation","status":"Baseline stable","spm":6.0,"filling_pct":82},{"phase":"Simulated anomaly","status":"Potential rod floating detected","spm":6.0,"filling_pct":65},{"phase":"Edge detection","status":"Synthetic load pattern flagged","spm":6.0,"filling_pct":65},{"phase":"Simulated recovery","status":"Constrained speed adjustment","spm":5.0,"filling_pct":78},{"phase":"Recovery summary","status":"Simulated recovery completed","spm":5.0,"filling_pct":78}],"edge":dynacard(50,True),"control":fast_mpc(65,6,35,rod_risk=True),"recovery_time_min":4,"max_modeled_load_kN":1450,"final_state":"Simulated stabilized state; field validation required."}
