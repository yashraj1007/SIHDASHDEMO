"""FastAPI adapter. Run: uvicorn app.main:app --reload --port 8000 (from backend/)."""
from fastapi import FastAPI, WebSocket
from pydantic import BaseModel, Field
from . import models

app=FastAPI(title="Synthetic Well-to-Surface Digital Twin",version="0.1.0",description="Educational prototype; simulated data only, no field calibration or equipment control.")
class ThermalRequest(BaseModel):
    phase:str="injection"; hours:float=Field(24,ge=0,le=10000); steam_c:float=Field(240,ge=50,le=400); radius_m:float=Field(20,gt=0,le=1000)
class DynacardRequest(BaseModel):
    sample_hz:int=Field(50,ge=1,le=200); anomaly:bool=False; samples:int=Field(240,ge=24,le=2000)
class FastRequest(BaseModel):
    fillage:float=Field(82,ge=0,le=100); spm:float=Field(6,ge=0,le=30); vfd:float=Field(35,ge=0,le=100); max_load:float=Field(1800,gt=0); max_spm:float=Field(10,gt=0,le=30); min_vfd:float=Field(20,ge=0); max_vfd:float=Field(60,gt=0,le=100); rod_risk:bool=False
class SlowRequest(BaseModel):
    steam_cost:float=Field(12,ge=0); oil_price:float=Field(65,ge=0); electricity_cost:float=Field(.12,ge=0); base_oil:float=Field(24,ge=0); energy_kwh:float=Field(420,ge=0)
@app.get('/api/digital-twin/state')
def state(): return {"data_class":"synthetic demonstration","thermal":models.thermal_prediction(),"dynacard":models.dynacard(),"control":models.fast_mpc(),"disclaimer":"Not Baghewala field data; no field validation; no equipment commands."}
@app.get('/api/thermal/prediction')
def thermal(phase:str="injection",hours:float=24): return models.thermal_prediction(phase,hours)
@app.post('/api/thermal/simulate')
def thermal_simulate(req:ThermalRequest): return models.thermal_prediction(req.phase,req.hours,req.steam_c,req.radius_m)
@app.get('/api/thermal/diagnostics')
def thermal_diagnostics():
    x=models.thermal_prediction(); return {k:x[k] for k in ('status','physics_residual_proxy','boundary_residual_c','initial_condition','assumptions','compute_ms')}
@app.post('/api/dynacard/generate')
def card_generate(req:DynacardRequest): return models.dynacard(req.sample_hz,False,req.samples)
@app.post('/api/dynacard/analyze')
def card_analyze(req:DynacardRequest): return models.dynacard(req.sample_hz,req.anomaly,req.samples)
@app.get('/api/edge/status')
def edge_status(): return {"state":"local simulated processor available","supported_sample_hz":[50,100],"last_benchmark":models.dynacard() ['processing_ms'],"hardware":"Python prototype; no edge device attached"}
@app.post('/api/control/fast-loop/simulate')
def fast(req:FastRequest): return models.fast_mpc(**req.model_dump())
@app.post('/api/control/slow-loop/optimize')
def slow(req:SlowRequest): return models.slow_css(**req.model_dump())
@app.post('/api/control/joint/optimize')
def joint():
    t=models.thermal_prediction(); d=models.dynacard(); f=models.fast_mpc(fillage=d['pump_fillage_pct'],rod_risk=d['anomaly']); s=models.slow_css()
    return {"thermal":t,"dynacard":d,"fast_loop":f,"slow_loop":s,"coordination":"Thermal temperature informs illustrative viscosity and production; simulated fillage and load inform constrained SRP candidates."}
@app.post('/api/simulation/rod-floating')
def rod_floating(): return models.rod_floating_simulation()
@app.post('/api/simulation/run')
def run(): return models.rod_floating_simulation()
@app.get('/api/simulation/{scenario_id}')
def get_sim(scenario_id:str): return {"scenario_id":scenario_id,**models.rod_floating_simulation()}
@app.websocket('/ws/simulation')
async def ws(websocket:WebSocket):
    await websocket.accept()
    await websocket.send_json(models.rod_floating_simulation())
    await websocket.close()
