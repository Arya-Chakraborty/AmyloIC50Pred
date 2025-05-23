from flask import Flask, request, jsonify
import numpy as np
import pandas as pd
import pickle as pkl
from padelpy import from_smiles
import os

app = Flask(__name__)

def smiles_to_descriptors(smiles_list, compiled_data_path):
    """
    Converts SMILES strings to molecular descriptors using PaDEL-Py and filters them
    to match the descriptors in the reference dataset.
    
    Process:
    1. Loads the reference dataset to get the expected descriptor columns
    2. For each SMILES string, generates molecular descriptors using PaDEL
    3. Filters and aligns the generated descriptors to match the reference dataset
    4. Handles any missing columns by adding them with NaN values
    
    Args:
        smiles_list (list): List of SMILES strings to process
        compiled_data_path (str): Path to the reference dataset CSV file
        
    Returns:
        pd.DataFrame: DataFrame with descriptors matching the reference dataset columns
    """
    # Load reference dataset to get expected descriptor columns
    compiled_df = pd.read_csv(compiled_data_path)
    # Exclude target columns ('Class' and 'IC50') to get just the feature columns
    reference_descriptors = compiled_df.drop(['Class', 'IC50'], axis=1, errors='ignore').columns.tolist()

    all_descriptors_list = []

    # Process each SMILES string to generate descriptors
    for smiles in smiles_list:
        try:
            # Generate descriptors using PaDEL with timeout for safety
            descriptors = from_smiles(smiles, timeout=60)
            all_descriptors_list.append(descriptors)
        except Exception as e:
            # If descriptor generation fails, append empty dict
            all_descriptors_list.append({})

    # Create DataFrame from generated descriptors
    descriptors_df = pd.DataFrame(all_descriptors_list)

    # Filter columns to only include those present in reference dataset
    filtered_descriptors_df = descriptors_df[
        [col for col in reference_descriptors if col in descriptors_df.columns]
    ]

    # Add any missing columns from reference with NaN values
    for col in reference_descriptors:
        if col not in filtered_descriptors_df.columns:
            filtered_descriptors_df[col] = np.nan

    # Ensure column order matches reference dataset
    filtered_descriptors_df = filtered_descriptors_df[reference_descriptors]

    return filtered_descriptors_df

def preprocessing(df):
    """
    Preprocesses the descriptors dataframe to prepare for model prediction.
    
    Process:
    1. Loads the reference dataset to get value ranges
    2. Converts all values to numeric (coercing errors to NaN)
    3. Caps values to the min/max ranges from the reference dataset
    4. Imputes missing values using a pre-trained imputer
    
    Args:
        df (pd.DataFrame): DataFrame of molecular descriptors
        
    Returns:
        pd.DataFrame: Preprocessed DataFrame ready for model prediction
    """
    script_dir = os.path.dirname(__file__)
    compiled_data_path = os.path.join(script_dir, r'datasets\Compiled_data.csv')
    df_cols = pd.read_csv(compiled_data_path)
    df_cols = df_cols.iloc[:, 1:]
    
    # Ensure only expected columns are present
    df = df[df_cols.drop(['Class', 'IC50'], axis=1, errors='ignore').columns]

    # Convert all values to numeric
    for col in df:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # Cap values to reference dataset ranges
    for col in df.columns:
        max_val = df_cols[col].max()
        min_val = df_cols[col].min()
        df[col] = np.clip(df[col], min_val, max_val)

    # Impute missing values using pre-trained imputer
    imputer_model_path = os.path.join(script_dir, r'models\imputer_model.pkl')
    with open(imputer_model_path, 'rb') as f:
        imputer = pkl.load(f)
    df = imputer.transform(df)
    df = pd.DataFrame(df, columns=df_cols.drop(['Class', 'IC50'], axis=1, errors='ignore').columns)

    return df

def decoy_inhibitor_classification(df):
    """
    Classifies compounds as either decoys (0) or inhibitors (1).
    
    Args:
        df (pd.DataFrame): Preprocessed descriptors DataFrame
        
    Returns:
        pd.DataFrame: Original DataFrame with added 'D/I' column containing predictions
    """
    script_dir = os.path.dirname(__file__)
    decoy_inhibitor_model_path = os.path.join(script_dir, r'models\decoy_inhibitor_rf.pkl')
    with open(decoy_inhibitor_model_path, 'rb') as f:
        decoy_inhibitor = pkl.load(f)
    y_pred = decoy_inhibitor.predict(df)
    df['D/I'] = y_pred
    return df

def potency_classification(df):
    """
    Classifies inhibitors into potency classes (0-4).
    
    Args:
        df (pd.DataFrame): DataFrame containing inhibitor descriptors
        
    Returns:
        pd.DataFrame: Original DataFrame with added 'Class' column containing predictions
    """
    script_dir = os.path.dirname(__file__)
    classifier_model_path = os.path.join(script_dir, r'models\HGB_model_potency_classifier.pkl')
    with open(classifier_model_path, 'rb') as f:
        classifier = pkl.load(f)
    y_pred = classifier.predict(df)
    df['Class'] = y_pred
    return df

def ic50_regression(df):
    """
    Predicts IC50 values for inhibitor compounds.
    
    Process:
    1. Loads the regression model and required feature columns
    2. For each sample, selects the required features and makes prediction
    3. Applies polynomial coefficients to convert prediction to IC50 value
    
    Args:
        df (pd.DataFrame): DataFrame containing inhibitor descriptors with Class
        
    Returns:
        pd.DataFrame: DataFrame with IC50 predictions added
    """
    if df.empty:
        return pd.DataFrame()
    
    script_dir = os.path.dirname(__file__)
    regression_model_path = os.path.join(script_dir, r'models\rf_model_regression.pkl')
    compiled_data_csv = os.path.join(script_dir, r'datasets\Compiled_data.csv')

    with open(regression_model_path, 'rb') as f:
        regression_model = pkl.load(f)
    df_cols = pd.read_csv(compiled_data_csv)
    df_cols = df_cols.iloc[:, 1:]
    df_cols = df_cols.drop('IC50', axis=1, errors='ignore')
    cols = regression_model.feature_names_in_.tolist()

    # Predict IC50 values for each sample
    y_pred = []
    for i in range(df.shape[0]):
        sample_df = pd.DataFrame(df.iloc[i, :]).T
        sample_df = sample_df[cols]
        pred = regression_model.predict(sample_df)[0]
        y_pred.append(pred)

    # Coefficients for polynomial conversion to IC50 values
    coefficients = [7e-7, -0.00052, 0.1870, -10.123, 248.08]
    y_pred_ic50 = np.polyval(coefficients, y_pred)
    
    # Prepare results DataFrame
    result_df = df[cols].copy()
    result_df['IC50'] = y_pred_ic50
    return result_df

@app.route('/api/predict', methods=['POST'])
def predict():
    """
    Main prediction endpoint that processes SMILES strings and returns predictions.
    
    Process:
    1. Receives SMILES strings in JSON format
    2. Converts SMILES to molecular descriptors
    3. Preprocesses descriptors
    4. Classifies compounds as decoys or inhibitors
    5. For inhibitors, predicts potency class and IC50 values
    6. Returns structured prediction results
    
    Returns:
        JSON response containing predictions for each input SMILES string
    """
    try:
        # Get and validate input data
        data = request.get_json()
        if not data or 'smiles' not in data:
            return jsonify({'error': 'No SMILES strings provided'}), 400
        
        smiles_list = data['smiles']
        if not isinstance(smiles_list, list):
            return jsonify({'error': 'SMILES should be provided as a list'}), 400

        # Define paths to data files
        script_dir = os.path.dirname(__file__)
        compiled_data_csv = os.path.join(script_dir, r'datasets\Compiled_data.csv')

        # Process SMILES through the prediction pipeline
        descriptors_df = smiles_to_descriptors(smiles_list, compiled_data_csv)
        preprocessed_df = preprocessing(descriptors_df)
        di_df = decoy_inhibitor_classification(preprocessed_df.copy())
        
        # Separate decoys and inhibitors
        inhibitors_df = di_df[di_df['D/I'] == 1].drop('D/I', axis=1)
        decoys_df = di_df[di_df['D/I'] == 0].drop('D/I', axis=1)
        
        # Prepare response structure
        response = []
        
        # Add decoy predictions to response
        for idx, smiles in enumerate(smiles_list):
            if idx in decoys_df.index:
                response.append({
                    'smiles': smiles,
                    'classification': 'decoy',
                    'class': None,
                    'ic50': None
                })
        
        # Process inhibitors and add their predictions
        if not inhibitors_df.empty:
            classified_df = potency_classification(inhibitors_df.copy())
            regressed_df = ic50_regression(classified_df.copy())
            
            for idx, row in regressed_df.iterrows():
                if idx < len(smiles_list):  # Ensure index is within bounds
                    response.append({
                        'smiles': smiles_list[idx],
                        'classification': 'inhibitor',
                        'class': int(row['Class']),
                        'ic50': float(row['IC50'])
                    })
        
        return jsonify({'predictions': response})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)