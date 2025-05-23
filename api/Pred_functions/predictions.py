import numpy as np
import pandas as pd
import tqdm
import pickle as pkl
from padelpy import from_smiles
import os # Import os for path manipulation

def smiles_to_descriptors(smiles_df_path, compiled_data_path):
    """
    Converts SMILES strings from a CSV to molecular descriptors using PaDEL-Py,
    and filters them to match the descriptors in Compiled_data.csv.

    Args:
        smiles_df_path (str): Path to the CSV file containing SMILES strings
                              in the first column.
        compiled_data_path (str): Path to the Compiled_data.csv file to get
                                  the reference descriptor columns.

    Returns:
        pd.DataFrame: A DataFrame with the selected descriptors for each SMILES string.
    """
    smiles_df = pd.read_csv(smiles_df_path, header=None)
    smiles_list = smiles_df.iloc[:, 0].tolist()

    # Load compiled data to get reference descriptor columns
    compiled_df = pd.read_csv(compiled_data_path)
    # Exclude 'Class' and 'IC50' as these are targets, not features
    reference_descriptors = compiled_df.drop(['Class', 'IC50'], axis=1, errors='ignore').columns.tolist()

    all_descriptors_list = []

    print("Converting SMILES to descriptors...")
    for smiles in tqdm.tqdm(smiles_list):
        try:
            # Generate descriptors for a single SMILES string
            descriptors = from_smiles(smiles, timeout=60) # Added timeout for safety
            all_descriptors_list.append(descriptors)
        except Exception as e:
            print(f"Error processing SMILES '{smiles}': {e}")
            all_descriptors_list.append({}) # Append empty dict on error

    # Create a DataFrame from the generated descriptors
    descriptors_df = pd.DataFrame(all_descriptors_list)

    # Filter columns to only include those present in Compiled_data.csv
    # and ensure the order matches
    filtered_descriptors_df = descriptors_df[
        [col for col in reference_descriptors if col in descriptors_df.columns]
    ]

    # Add any missing columns from reference_descriptors with NaN values
    # This ensures the DataFrame has all the expected columns
    for col in reference_descriptors:
        if col not in filtered_descriptors_df.columns:
            filtered_descriptors_df[col] = np.nan

    # Reorder columns to match the reference_descriptors
    filtered_descriptors_df = filtered_descriptors_df[reference_descriptors]

    return filtered_descriptors_df


def preprocessing(df): # pass the dataframe
    df_cols= pd.read_csv(r'..\datasets\Compiled_data.csv')
    df_cols=df_cols.iloc[:,1:]
    # Ensure the input df has only the columns expected by the model
    # The smiles_to_descriptors function should handle the initial column selection
    # Here, we're just making sure it's aligned with the compiled data's features.
    df = df[df_cols.drop(['Class','IC50'],axis=1, errors='ignore').columns]

    for col in df:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    # Capping the values
    for col in tqdm.tqdm(df.columns):
        max_val=df_cols[col].max()
        min_val=df_cols[col].min()
        df[col]=np.clip(df[col],min_val,max_val) # normalizing the values to the range of the original data

    # Imputing the missing values
    # The imputer model path should be robust
    script_dir = os.path.dirname(__file__) # Get the directory of the current script
    imputer_model_path = os.path.join(script_dir, r'..\models\imputer_model.pkl')

    with open(imputer_model_path, 'rb') as f:
        imputer=pkl.load(f)
    df=imputer.transform(df)
    df=pd.DataFrame(df,columns=df_cols.drop(['Class','IC50'], axis=1, errors='ignore').columns)

    return df

# ...existing code...
def Decoy_inhibitor(df):
    # decoy_inhibitor classification
    script_dir = os.path.dirname(__file__)
    decoy_inhibitor_model_path = os.path.join(script_dir, r'..\models\decoy_inhibitor_rf.pkl')
    with open(decoy_inhibitor_model_path, 'rb') as f:
        decoy_inhibitor=pkl.load(f)
    y_pred=decoy_inhibitor.predict(df)
    df['D/I']=y_pred
    return df[df['D/I']==1].drop('D/I',axis=1)


def classification(df):
    script_dir = os.path.dirname(__file__)
    classifier_model_path = os.path.join(script_dir, r'..\models\HGB_model_potency_classifier.pkl')
    with open(classifier_model_path,'rb') as f:
        classifier=pkl.load(f)
    y_pred=classifier.predict(df)
    df['Class']=y_pred
    return df

def regression(df):
    if df.empty:
        print("No inhibitors found for regression.")
        return pd.DataFrame() # Return empty DataFrame if no inhibitors
    
    script_dir = os.path.dirname(__file__)
    regression_model_path = os.path.join(script_dir, r'..\models\rf_model_regression.pkl')
    compiled_data_csv = os.path.join(script_dir, r'..\datasets\Compiled_data.csv')

    with open(regression_model_path, 'rb') as f:
        regression_model = pkl.load(f)
    df_cols = pd.read_csv(compiled_data_csv)
    df_cols = df_cols.iloc[:, 1:]
    df_cols = df_cols.drop('IC50', axis=1, errors='ignore') # Use errors='ignore' if 'IC50' might not be there initially
    cols = regression_model.feature_names_in_.tolist() # Ensure these are the features the model expects

    y_pred = []
    print("Performing regression...")
    for i in tqdm.tqdm(range(df.shape[0])):
        # Create a new DataFrame for prediction, ensuring columns match the training data
        # This approach is generally for rank-based features. If your model directly
        # uses the numerical descriptor values, this part might need adjustment.
        # Assuming 'cols' are the actual features used for training
        sample_df = pd.DataFrame(df.iloc[i, :]).T
        sample_df = sample_df[cols] # Ensure the sample has the correct features

        # Predict using the prepared sample
        pred = regression_model.predict(sample_df)[0]
        y_pred.append(pred)

    coefficients = [7e-7, -0.00052, 0.1870, -10.123, 248.08]
    y_pred_IC50=np.polyval(coefficients, y_pred)
    
    # Create a DataFrame to return with the original features and predicted IC50
    result_df = df[cols].copy() # Keep the features that were used for prediction
    result_df['IC50'] = y_pred_IC50
    return result_df


# --- Main execution block ---
if __name__ == "__main__":
    # Define paths
    input_smiles_csv = r'..\datasets\smiles_input.csv' # Assume this file exists with SMILES in the first column
    compiled_data_csv = r'..\datasets\Compiled_data.csv'
    
    # Generate descriptors from SMILES
    print(f"Loading SMILES from: {input_smiles_csv}")
    descriptors_df = smiles_to_descriptors(input_smiles_csv, compiled_data_csv)

    print("Preprocessing generated descriptors...")
    cl = preprocessing(descriptors_df)

    print("Applying Decoy/Inhibitor classification...")
    val = Decoy_inhibitor(cl)

    print("Applying Potency classification...")
    try:
        classed = classification(val)
    except Exception as e:
        print(f'There are no inhibitors in the data provided, model raised the error: {e}')
        classed = pd.DataFrame() # Ensure 'classed' is defined even if no inhibitors

    
    try:
        pred=regression(classed)
        if not pred.empty:
            print("\nFinal Predictions (Inhibitors with IC50):")
            print(pred)
        else:
            print("No inhibitors were classified, so no regression performed.")
    except Exception as e:
        print(f'An error occurred during regression: {e}')