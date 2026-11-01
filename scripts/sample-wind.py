import argparse
from pathlib import Path

import numpy as np
import vtkmodules.all as vtk
from vtkmodules.util.numpy_support import numpy_to_vtk, vtk_to_numpy


def sample(case, output, height, bounds, spacing):
    reader = vtk.vtkOpenFOAMReader()
    reader.SetFileName(str(case))
    reader.Use64BitFloatsOn()
    reader.SetCreateCellToPoint(False)
    reader.UpdateInformation()
    reader.DisableAllPatchArrays()
    reader.SetPatchArrayStatus('internalMesh', 1)
    reader.DisableAllCellArrays()
    reader.SetCellArrayStatus('U', 1)
    times = vtk_to_numpy(reader.GetTimeValues())
    timestep = float(times.max())
    reader.SetTimeValue(timestep)
    reader.Update()
    iterator = reader.GetOutput().NewIterator()
    iterator.InitTraversal()
    grid = iterator.GetCurrentDataObject()
    if not grid or not grid.GetCellData().GetArray('U'):
        raise ValueError('The internal OpenFOAM mesh has no velocity field.')

    point_data = vtk.vtkCellDataToPointData()
    point_data.SetInputData(grid)
    point_data.PassCellDataOff()
    point_data.Update()

    plane = vtk.vtkPlane()
    plane.SetOrigin(0, 0, height)
    plane.SetNormal(0, 0, 1)
    section = vtk.vtkCutter()
    section.SetInputConnection(point_data.GetOutputPort())
    section.SetCutFunction(plane)
    triangles = vtk.vtkTriangleFilter()
    triangles.SetInputConnection(section.GetOutputPort())

    west, south, east, north = bounds
    width = round((east - west) / spacing)
    rows = round((north - south) / spacing)
    x, y = np.meshgrid(west + (np.arange(width) + .5) * spacing,
                       north - (np.arange(rows) + .5) * spacing)
    coordinates = np.column_stack((x.ravel(), y.ravel(), np.full(x.size, height)))
    points = vtk.vtkPoints()
    points.SetData(numpy_to_vtk(coordinates, deep=True))
    samples = vtk.vtkPolyData()
    samples.SetPoints(points)
    probe = vtk.vtkProbeFilter()
    probe.SetInputData(samples)
    probe.SetSourceConnection(triangles.GetOutputPort())
    probe.Update()
    data = probe.GetOutput().GetPointData()
    velocity = vtk_to_numpy(data.GetArray('U'))
    valid = vtk_to_numpy(data.GetArray('vtkValidPointMask')).astype(bool)
    speed = np.linalg.norm(velocity.astype(np.float64), axis=1).astype(np.float32)
    speed[~valid] = np.nan
    if valid.mean() < .25 or not np.isfinite(speed[valid]).all():
        raise ValueError(f'Invalid wind grid: {valid.sum()}/{valid.size} samples located; '
                         f'mesh bounds {grid.GetBounds()}; finite speeds '
                         f'{np.isfinite(speed[valid]).sum()}/{valid.sum()}.')
    np.savez_compressed(output, speed=speed.reshape(rows, width),
                        bounds=bounds, spacing=spacing, height=height, timestep=timestep)
    print(f'{case.parent.name}: step {timestep:g}, {valid.sum()} valid samples, '
          f'{np.nanmin(speed):.3f}-{np.nanmax(speed):.3f} m/s', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Sample the latest OpenFOAM velocity field using pvpython.')
    parser.add_argument('case', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--height', type=float, default=1.5)
    parser.add_argument('--bounds', type=float, nargs=4, default=[-700, -500, 700, 500])
    parser.add_argument('--spacing', type=float, default=2)
    args = parser.parse_args()
    sample(args.case, args.output, args.height, args.bounds, args.spacing)
