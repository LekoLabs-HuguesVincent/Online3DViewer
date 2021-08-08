OV.ThreeImporter = class extends OV.ImporterBase
{
    constructor ()
    {
        super ();
    }

    CanImportExtension (extension)
    {
        return extension === 'fbx';
    }

    GetKnownFileFormats ()
    {
        return {
            'fbx' : OV.FileFormat.Binary
        };
    }
    
    GetUpDirection ()
    {
        return OV.Direction.Y;
    }    
    
    ClearContent ()
    {
        if (this.loadedScene !== undefined && this.loadedScene !== null) {
            this.loadedScene.traverse ((child) => {
                if (child.isMesh) {
                    child.geometry.dispose ();
                }
            });
            this.loadedScene = null;
        }
    }

    ResetContent ()
    {
        this.loadedScene = null;
    }

    ImportContent (fileContent, onFinish)
    {
        const libraries = this.GetExternalLibraries ();
        if (libraries === null) {
            onFinish ();
            return;
        }
        Promise.all (libraries).then (() => {
            this.LoadModel (fileContent, onFinish);    
        }).catch (() => {
            onFinish ();
        });
    }

    GetExternalLibraries ()
    {
        if (this.extension === 'fbx') {
            return [
                OV.LoadExternalLibrary ('three_loaders/FBXLoader.js'),
                OV.LoadExternalLibrary ('three_loaders/fflate.min.js')
            ];
        }
        return null;
    }

    CreateLoader (manager)
    {
        let loader = null;
        if (this.extension === 'fbx') {
            loader = new THREE.FBXLoader (manager);
        }        
        return loader;
    }

    LoadModel (fileContent, onFinish)
    {
        let loadedScene = null;
        let blobToBuffer = {};
        let loadingManager = new THREE.LoadingManager (() => {
            this.OnThreeObjectsLoaded (loadedScene, blobToBuffer, onFinish);
        });

        const mainFileUrl = OV.CreateObjectUrl (fileContent);
        loadingManager.setURLModifier ((url) => {
            if (url === mainFileUrl) {
                return url;
            }
            if (url.startsWith ('data:')) {
                return url;
            }
            const fileBuffer = this.callbacks.getFileBuffer (url);
            const fileUrl = OV.CreateObjectUrl (fileBuffer);
            blobToBuffer[fileUrl] = {
                name : OV.GetFileName (url),
                buffer : fileBuffer
            };
            return fileUrl;
        });

        const loader = this.CreateLoader (loadingManager);
        if (loader === null) {
            onFinish ();
            return;
        }

        // TODO: error handling
        loader.load (mainFileUrl,
            (object) => {
                loadedScene = object;
            },
            () => {
            },
            (err) => {
                this.SetError ();
                this.SetMessage (err);
                onFinish ();
            }
        );
    }

    OnThreeObjectsLoaded (scene, blobToBuffer, onFinish)
    {
        function ConvertThreeMaterialToMaterial (threeMaterial, blobToBuffer)
        {
            function SetColor (color, threeColor)
            {
                color.Set (
                    parseInt (threeColor.r * 255.0, 10),
                    parseInt (threeColor.g * 255.0, 10),
                    parseInt (threeColor.b * 255.0, 10)
                );
            }
        
            function CreateTexture (threeMap, blobToBuffer)
            {
                if (threeMap.image === undefined || threeMap.image === null) {
                    return null;
                }
                let imageSrc = threeMap.image.currentSrc;
                if (imageSrc.startsWith ('data:')) {
                    let base64Buffer = OV.Base64DataURIToArrayBuffer (threeMap.image.currentSrc);
                    let texture = new OV.TextureMap ();
                    texture.name = 'Embedded.' + OV.GetFileExtensionFromMimeType (base64Buffer.mimeType);
                    texture.url = OV.CreateObjectUrlWithMimeType (base64Buffer.buffer, base64Buffer.mimeType);
                    texture.buffer = base64Buffer.buffer;
                    return texture;
                } else if (imageSrc.startsWith ('blob:')) {
                    let buffer = blobToBuffer[imageSrc];
                    if (buffer === undefined) {
                        return null;
                    }
                    let texture = new OV.TextureMap ();
                    texture.name = buffer.name;
                    texture.url = imageSrc;
                    texture.buffer = buffer.buffer;
                    return texture;
                }
                return null;
            }
        
            // TODO: PBR materials
            let material = new OV.Material (OV.MaterialType.Phong);
            material.name = threeMaterial.name;
            SetColor (material.color, threeMaterial.color);
            if (threeMaterial.type === 'MeshPhongMaterial') {
                SetColor (material.specular, threeMaterial.specular);
                material.shininess = threeMaterial.shininess / 100.0;
            }
            if (threeMaterial.map !== undefined && threeMaterial.map !== null) {
                material.diffuseMap = CreateTexture (threeMaterial.map, blobToBuffer);
            }
            return material;
        }

        function FindMatchingMaterialIndex (model, material)
        {
            for (let i = 0; i < model.MaterialCount (); i++) {
                let modelMaterial = model.GetMaterial (i);
                if (OV.MaterialIsEqual (modelMaterial, material)) {
                    return i;
                }
            }
            return model.AddMaterial (material);
        }

        this.loadedScene = scene;
        scene.traverse ((child) => {
            if (child.isMesh) {
                // TODO: array of materials
                let material = ConvertThreeMaterialToMaterial (child.material, blobToBuffer);
                const materialIndex = FindMatchingMaterialIndex (this.model, material);
                let mesh = OV.ConvertThreeGeometryToMesh (child.geometry, materialIndex);
                if (child.matrixWorld !== undefined && child.matrixWorld !== null) {
                    const matrix = new OV.Matrix (child.matrixWorld.elements);
                    const transformation = new OV.Transformation (matrix);
                    const determinant = matrix.Determinant ();
                    const mirrorByX = OV.IsNegative (determinant);
                    OV.TransformMesh (mesh, transformation);
                    if (mirrorByX) {
                        OV.FlipMeshTrianglesOrientation (mesh);
                    }
                }
                this.model.AddMesh (mesh);
            }
        });
        onFinish ();
    }
};
